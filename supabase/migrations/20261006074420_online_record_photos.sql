-- Private R2 objects; Postgres is the authority for grants, quotas and versions.
create table public.photo_entitlements (
 shop_id uuid primary key references public.shops(id), enabled boolean not null default false,
 quota_bytes bigint not null default 0 check(quota_bytes>=0), used_bytes bigint not null default 0 check(used_bytes>=0),
 reserved_bytes bigint not null default 0 check(reserved_bytes>=0), enabled_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.photo_requests (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 requested_by uuid not null references auth.users(id), status text not null default 'pending' check(status in ('pending','approved','declined')),
 note text not null default '', created_at timestamptz not null default now(), reviewed_at timestamptz
);
create unique index photo_request_open on public.photo_requests(shop_id) where status='pending';
create table public.record_photos (
 id uuid primary key, shop_id uuid not null, record_id uuid not null, slot text not null check(slot in ('person','idFront')),
 uploaded_by uuid not null references auth.users(id), state text not null check(state in ('pending','current','retained','purged','cancelled')),
 bytes bigint not null check(bytes between 1 and 10485760), md5 text not null check(md5 ~ '^[a-f0-9]{32}$'),
 preview_bytes bigint not null check(preview_bytes between 1 and 524288), preview_md5 text not null check(preview_md5 ~ '^[a-f0-9]{32}$'),
 base_revision integer not null check(base_revision>=0), reason text not null default '',
 failure_code text, failed_at timestamptz,
 created_at timestamptz not null default now(), completed_at timestamptz, delete_after timestamptz,
 foreign key(shop_id,record_id) references public.records(shop_id,id)
);
create unique index photo_current_slot on public.record_photos(shop_id,record_id,slot) where state='current';
create index photo_record_versions on public.record_photos(shop_id,record_id,created_at desc,id);
create index photo_cleanup on public.record_photos(delete_after) where state in ('pending','retained','cancelled');
create index photo_actor_rate on public.record_photos(uploaded_by,created_at);
create table public.photo_heads (
 shop_id uuid not null, record_id uuid not null, slot text not null check(slot in ('person','idFront')),
 revision integer not null default 0, photo_id uuid references public.record_photos(id),
 primary key(shop_id,record_id,slot), foreign key(shop_id,record_id) references public.records(shop_id,id)
);
create table public.photo_audit (
 id bigint generated always as identity primary key, shop_id uuid not null references public.shops(id),
 actor uuid references auth.users(id), action text not null, photo_id uuid, reason text not null default '',
 at timestamptz not null default now()
);
create index photo_audit_shop on public.photo_audit(shop_id,at desc);
-- No client writes, including privileged RPCs. Authenticated users may read only their shop.
alter table public.photo_entitlements enable row level security;
alter table public.photo_requests enable row level security;
alter table public.record_photos enable row level security;
alter table public.photo_heads enable row level security;
alter table public.photo_audit enable row level security;
revoke all on public.photo_entitlements,public.photo_requests,public.record_photos,public.photo_heads,public.photo_audit from public,anon,authenticated;
grant select on public.photo_entitlements,public.photo_requests,public.record_photos,public.photo_heads,public.photo_audit to authenticated;
grant all on public.photo_entitlements,public.photo_requests,public.record_photos,public.photo_heads,public.photo_audit to service_role;
grant usage,select on sequence public.photo_audit_id_seq to service_role;
create policy photo_entitlement_read on public.photo_entitlements for select to authenticated using(public.shop_access(shop_id));
create policy photo_request_read on public.photo_requests for select to authenticated using(public.shop_access(shop_id));
create policy photo_record_read on public.record_photos for select to authenticated using(public.shop_access(shop_id) and (state='current' or (state='retained' and public.shop_access(shop_id,true))));
create policy photo_head_read on public.photo_heads for select to authenticated using(public.shop_access(shop_id));
create policy photo_audit_read on public.photo_audit for select to authenticated using(public.shop_access(shop_id,true));

-- Called ONLY by authenticated Edge Functions using a service-role client.
-- Actor is derived from auth.getUser(), never accepted from the request body.
create function public.photo_service(p_actor uuid,p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s uuid:=(p->>'shopId')::uuid; r uuid:=(p->>'recordId')::uuid;
 v public.record_photos; e public.photo_entitlements; h public.photo_heads;
 role_name text; admin_ok boolean; creator uuid; count_now bigint; result jsonb;
begin
 select public.is_platform_administrator(p_actor) into admin_ok;
 if p_action='admin-requests' then
  if not coalesce(admin_ok,false) then raise exception 'noAccess'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select q.*,s.profile->>'shopName' as shop_name from public.photo_requests q join public.shops s on s.id=q.shop_id
   where q.status='pending' order by q.created_at,q.id limit 50 offset least(greatest(coalesce((p->>'offset')::int,0),0),100000)
  )x),'[]'::jsonb);
 end if;
 if s is null then raise exception 'noAccess'; end if;
 select m.role into role_name from public.memberships m join public.account_status a on a.user_id=m.user_id
 where m.shop_id=s and m.user_id=p_actor and m.active and not a.must_change_password;
 if p_action like 'admin-%' then
  if not coalesce(admin_ok,false) then raise exception 'noAccess'; end if;
 elsif role_name is null then raise exception 'noAccess'; end if;
 -- A locked entitlement row serializes quota reservation, replacement and cleanup.
 insert into public.photo_entitlements(shop_id) values(s) on conflict do nothing;
 select * into e from public.photo_entitlements where shop_id=s for update;
 if p_action='admin-set' then
  if length(trim(coalesce(p->>'reason','')))=0 or length(p->>'reason')>500 then raise exception 'changeReasonRequired'; end if;
  if p->>'quotaBytes' is null or p->>'enabled' is null or (p->>'quotaBytes')::bigint not between (case when (p->>'enabled')::boolean then 1 else 0 end) and 100000000000000 then raise exception 'photoQuotaInvalid'; end if;
  update public.photo_entitlements set enabled=(p->>'enabled')::boolean,quota_bytes=(p->>'quotaBytes')::bigint,
   enabled_at=case when (p->>'enabled')::boolean then coalesce(enabled_at,now()) else enabled_at end,updated_at=now() where shop_id=s;
  update public.photo_requests set status=case when (p->>'enabled')::boolean then 'approved' else 'declined' end,
   note=p->>'reason',reviewed_at=now() where shop_id=s and status='pending';
  insert into public.photo_audit(shop_id,actor,action,reason) values(s,p_actor,'entitlement_changed',p->>'reason');
 elsif p_action='request' then
  if role_name<>'owner' then raise exception 'noAccess'; end if;
  if not e.enabled then insert into public.photo_requests(shop_id,requested_by) values(s,p_actor) on conflict do nothing; end if;
 elsif p_action not in ('status','admin-status') then
  if p_action in ('prepare','complete','remove','list','read','failed') then
   if p_action in ('complete','read','failed') then
    select * into v from public.record_photos where id=(p->>'id')::uuid and shop_id=s;
    if not found then raise exception 'photoNotFound'; end if; r:=v.record_id;
   end if;
   select created_by into creator from public.records where shop_id=s and id=r;
   if not found then raise exception 'photoRecordMissing'; end if;
   if p_action in ('prepare','complete','remove') and exists(select 1 from public.amendments where shop_id=s and record_id=r and payload->>'kind'='void') then raise exception 'recordVoided'; end if;
   if p_action='failed' then
    if v.uploaded_by<>p_actor then raise exception 'noAccess'; end if;
    if coalesce(p->>'code','') not in ('photoUploadFailed','photoChecksumFailed','photoUploadIncomplete','photoMissing','conflict','photoUploadExpired') then raise exception 'photoInvalidRequest'; end if;
    update public.record_photos set failure_code=p->>'code',failed_at=now() where id=v.id and state='pending';
    return '{}'::jsonb;
   end if;
   if p_action='list' then
    return jsonb_build_object('heads',coalesce((select jsonb_agg(to_jsonb(x)) from public.photo_heads x where shop_id=s and record_id=r),'[]'::jsonb),
     'photos',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.record_photos where shop_id=s and record_id=r
      and (state='current' or (coalesce((p->>'history')::boolean,false) and role_name='owner' and state='retained'))
      order by created_at desc,id limit 50 offset least(greatest(coalesce((p->>'offset')::int,0),0),100000))x),'[]'::jsonb));
   elsif p_action='read' then
    if v.state<>'current' and not (v.state='retained' and role_name='owner' and v.delete_after>now()) then raise exception 'photoNotFound'; end if;
    return to_jsonb(v);
   end if;
   if p_action='prepare' then
    if p->>'id' is null or p->>'slot' is null or p->>'bytes' is null or p->>'md5' is null or p->>'previewBytes' is null or p->>'previewMd5' is null or p->>'baseRevision' is null then raise exception 'photoInvalidRequest'; end if;
    select * into v from public.record_photos where id=(p->>'id')::uuid;
    if found then
     if v.shop_id<>s or v.record_id<>r or v.uploaded_by<>p_actor or v.slot<>p->>'slot'
      or v.bytes<>(p->>'bytes')::bigint or v.md5<>p->>'md5' or v.preview_bytes<>(p->>'previewBytes')::bigint
      or v.preview_md5<>p->>'previewMd5' then raise exception 'conflict'; end if;
     if v.state not in ('pending','current') or (v.state='pending' and v.delete_after<=now()) then raise exception 'photoUploadExpired'; end if;
     if v.state='pending' and not e.enabled then raise exception 'photoUploadsPaused'; end if;
     update public.record_photos set failure_code=null,failed_at=null where id=v.id and state='pending';
     return to_jsonb(v);
    end if;
    if not e.enabled then raise exception 'photoUploadsPaused'; end if;
   end if;
   if p_action='remove' and (p->>'baseRevision' is null or p->>'slot' is null) then raise exception 'photoInvalidRequest'; end if;
   insert into public.photo_heads(shop_id,record_id,slot) values(s,r,case when p_action='complete' then v.slot else p->>'slot' end) on conflict do nothing;
   select * into h from public.photo_heads where shop_id=s and record_id=r and slot=case when p_action='complete' then v.slot else p->>'slot' end for update;
   if p_action='complete' and v.uploaded_by<>p_actor then raise exception 'noAccess'; end if;
   if p_action='complete' and v.state='current' then return to_jsonb(v); end if;
   if p_action='complete' and (v.state<>'pending' or v.delete_after<=now() or v.uploaded_by<>p_actor) then raise exception 'photoUploadExpired'; end if;
   if p_action='remove' and h.photo_id is null and h.revision=(p->>'baseRevision')::int+1 then
    if role_name<>'owner' then raise exception 'photoOwnerOnly'; end if;
    if length(trim(coalesce(p->>'reason','')))=0 then raise exception 'changeReasonRequired'; end if;
    return '{}'::jsonb;
   end if;
   if h.revision<>(case when p_action='complete' then v.base_revision else (p->>'baseRevision')::int end) then raise exception 'conflict'; end if;
   if p_action='remove' or h.revision>0 or creator<>p_actor then
    if role_name<>'owner' then raise exception 'photoOwnerOnly'; end if;
    if length(trim(coalesce(case when p_action='complete' then v.reason else p->>'reason' end,'')))=0 then raise exception 'changeReasonRequired'; end if;
   end if;
   if p_action='prepare' then
    select count(*) into count_now from public.record_photos where uploaded_by=p_actor and (created_at>now()-interval '1 minute' or (state='pending' and delete_after>now()));
    if count_now>=20 then raise exception 'photoRateLimited'; end if;
    if e.used_bytes+e.reserved_bytes+(p->>'bytes')::bigint+(p->>'previewBytes')::bigint>e.quota_bytes then raise exception 'photoStorageFull'; end if;
    insert into public.record_photos(id,shop_id,record_id,slot,uploaded_by,state,bytes,md5,preview_bytes,preview_md5,base_revision,reason,delete_after)
    values((p->>'id')::uuid,s,r,p->>'slot',p_actor,'pending',(p->>'bytes')::bigint,p->>'md5',(p->>'previewBytes')::bigint,p->>'previewMd5',h.revision,left(coalesce(p->>'reason',''),500),now()+interval '24 hours') returning * into v;
    update public.photo_entitlements set reserved_bytes=reserved_bytes+v.bytes+v.preview_bytes where shop_id=s;
    return to_jsonb(v);
   elsif p_action='complete' then
    if not e.enabled then raise exception 'photoUploadsPaused'; end if;
    update public.record_photos set state='retained',delete_after=now()+interval '30 days' where id=h.photo_id;
    update public.record_photos set state='current',completed_at=now(),delete_after=null,failure_code=null,failed_at=null where id=v.id returning * into v;
    update public.photo_heads set photo_id=v.id,revision=revision+1 where shop_id=s and record_id=r and slot=v.slot;
    update public.photo_entitlements set reserved_bytes=reserved_bytes-v.bytes-v.preview_bytes,used_bytes=used_bytes+v.bytes+v.preview_bytes where shop_id=s;
    insert into public.photo_audit(shop_id,actor,action,photo_id,reason) values(s,p_actor,'uploaded',v.id,v.reason);
    return to_jsonb(v);
   elsif p_action='remove' then
    update public.record_photos set state='retained',delete_after=now()+interval '30 days' where id=h.photo_id;
    update public.photo_heads set photo_id=null,revision=revision+1 where shop_id=s and record_id=r and slot=h.slot;
    insert into public.photo_audit(shop_id,actor,action,photo_id,reason) values(s,p_actor,'removed',h.photo_id,left(p->>'reason',500));
    return '{}'::jsonb;
   end if;
  else raise exception 'Invalid photo action'; end if;
 end if;
 select * into e from public.photo_entitlements where shop_id=s;
 return jsonb_build_object('entitlement',to_jsonb(e),'request',(select to_jsonb(q) from public.photo_requests q where shop_id=s order by created_at desc limit 1),
  'pending',(select count(*) from public.record_photos where shop_id=s and state='pending'),
  'failed',(select count(*) from public.record_photos where shop_id=s and state in ('cancelled','pending') and (delete_after<now() or failure_code is not null)));
end; $$;
revoke all on function public.photo_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.photo_service(uuid,text,jsonb) to service_role;

-- Cleanup first tombstones candidates under the same shop lock, then deletes R2
-- objects. Acknowledgement releases quota only after both objects were deleted.
create function public.photo_cleanup(p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.record_photos; s uuid;
begin
 if p_id is null then
  for s in select distinct shop_id from public.record_photos where state in ('pending','retained') and delete_after<now() loop
   perform 1 from public.photo_entitlements where shop_id=s for update;
   update public.record_photos set state='cancelled' where shop_id=s and state='pending' and delete_after<now();
  end loop;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.record_photos where state in ('cancelled','retained') and delete_after<now() order by delete_after,id limit 100)x),'[]'::jsonb);
 end if;
 select shop_id into s from public.record_photos where id=p_id;
 perform 1 from public.photo_entitlements where shop_id=s for update;
 select * into v from public.record_photos where id=p_id for update;
 if v.state not in ('cancelled','retained') or v.delete_after>=now() then return '{}'::jsonb; end if;
 update public.photo_entitlements set
  reserved_bytes=reserved_bytes-case when v.state='cancelled' then v.bytes+v.preview_bytes else 0 end,
  used_bytes=used_bytes-case when v.state='retained' then v.bytes+v.preview_bytes else 0 end where shop_id=s;
 update public.record_photos set state='purged' where id=v.id;
 return '{}'::jsonb;
end; $$;
revoke all on function public.photo_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.photo_cleanup(uuid) to service_role;

-- Reconcile a bounded batch each run. The same entitlement lock prevents races
-- with reservations/completion/deletion. Unprocessed shops get priority next run.
alter table public.photo_entitlements add column reconciled_at timestamptz;
create index photo_reconcile_oldest on public.photo_entitlements(reconciled_at nulls first);
create function public.photo_reconcile() returns integer language plpgsql security invoker set search_path='' as $$
declare e public.photo_entitlements; total integer:=0; stored bigint; reserved bigint;
begin
 for e in select * from public.photo_entitlements order by reconciled_at nulls first,shop_id limit 100 for update skip locked loop
  select coalesce(sum(bytes+preview_bytes) filter(where state in ('current','retained')),0),
         coalesce(sum(bytes+preview_bytes) filter(where state in ('pending','cancelled')),0)
   into stored,reserved from public.record_photos where shop_id=e.shop_id;
  if e.used_bytes<>stored or e.reserved_bytes<>reserved then
   insert into public.photo_audit(shop_id,action,reason) values(e.shop_id,'usage_reconciled','Recomputed verified and reserved bytes from version metadata');
  end if;
  update public.photo_entitlements set used_bytes=stored,reserved_bytes=reserved,reconciled_at=now() where shop_id=e.shop_id;
  total:=total+1;
 end loop;
 return total;
end; $$;
revoke all on function public.photo_reconcile() from public,anon,authenticated;
grant execute on function public.photo_reconcile() to service_role;
