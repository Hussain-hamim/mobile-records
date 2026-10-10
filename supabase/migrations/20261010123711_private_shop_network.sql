-- Network data is intentionally separate from customer/record tables. No new grants
-- or policies on those tables. The private gateway is elevated only to enforce
-- cross-shop sharing and moderation; every call checks the current database actor.
create table private.network_profiles (
 shop_id uuid primary key references public.shops(id),
 name text not null, area text not null, contact text not null default '',
 enabled boolean not null default true,
 status text not null default 'pending' check(status in ('pending','approved','suspended')),
 version int not null default 1, updated_at timestamptz not null default now()
);
create table private.network_connections (
 low_id uuid references public.shops(id), high_id uuid references public.shops(id),
 requested_by uuid not null references public.shops(id),
 status text not null check(status in ('pending','accepted','disconnected')),
 version int not null default 1, updated_at timestamptz not null default now(),
 primary key(low_id,high_id), check(low_id<high_id)
);
create table private.network_blocks (
 shop_id uuid references public.shops(id), target_id uuid references public.shops(id),
 primary key(shop_id,target_id), check(shop_id<>target_id)
);
create table private.network_permissions (
 shop_id uuid, user_id uuid, can_share boolean not null default false,
 primary key(shop_id,user_id), foreign key(shop_id,user_id) references public.memberships(shop_id,user_id)
);
create table private.network_posts (
 id uuid primary key, shop_id uuid not null references public.shops(id),
 kind text not null check(kind in ('offer','request')), device jsonb not null,
 expires_at timestamptz not null default now()+interval '7 days',
 closed boolean not null default false, created_at timestamptz not null default now()
);
create table private.network_audience (
 post_id uuid references private.network_posts(id) on delete cascade,
 shop_id uuid references public.shops(id), primary key(post_id,shop_id)
);
create table private.network_reports (
 id uuid primary key, shop_id uuid not null references public.shops(id),
 target_id uuid not null references public.shops(id), reason text not null,
 resolved boolean not null default false, created_at timestamptz not null default now()
);
create table private.network_audit (
 id bigint generated always as identity primary key, actor uuid not null references auth.users(id),
 shop_id uuid references public.shops(id), action text not null, details jsonb not null,
 at timestamptz not null default clock_timestamp()
);
create index network_connections_high on private.network_connections(high_id);
create index network_connections_requester on private.network_connections(requested_by);
create index network_blocks_target on private.network_blocks(target_id);
create index network_permissions_user on private.network_permissions(user_id);
create index network_posts_shop on private.network_posts(shop_id,created_at desc);
create index network_audience_shop on private.network_audience(shop_id);
create index network_reports_shop on private.network_reports(shop_id);
create index network_reports_target on private.network_reports(target_id);
create index network_audit_actor on private.network_audit(actor,at desc);
create index network_audit_shop on private.network_audit(shop_id,at desc);
do $$ declare n text; begin
 foreach n in array array['network_profiles','network_connections','network_blocks','network_permissions','network_posts','network_audience','network_reports','network_audit'] loop
 execute format('alter table private.%I enable row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated',n);
 end loop;
end $$;

create function private.network_active(s uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.network_profiles where shop_id=s and enabled and status='approved');
$$;
create function private.network_connected(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select private.network_active(a) and private.network_active(b)
 and not exists(select 1 from private.network_blocks where (shop_id=a and target_id=b) or (shop_id=b and target_id=a))
 and exists(select 1 from private.network_connections where low_id=least(a,b) and high_id=greatest(a,b) and status='accepted');
$$;
-- Whitelist structured business fields. Arbitrary snapshot/customer JSON is rejected.
create function private.network_device(d jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v text;
begin
 if jsonb_typeof(d)<>'object' or d is null then raise exception 'networkInvalid'; end if;
 for k,v in select key,value from jsonb_each_text(d) loop
 if k not in ('brand','model','color','storage','price') then raise exception 'networkInvalid'; end if;
 if jsonb_typeof(d->k)<>'string' or length(v)>80 or v is null then raise exception 'networkInvalid'; end if;
 if regexp_replace(translate(v,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g') ~ '[0-9]{15}' then raise exception 'networkPrivate'; end if;
 end loop;
 if coalesce(length(trim(d->>'brand')),0)=0 or coalesce(length(trim(d->>'model')),0)=0 then raise exception 'networkInvalid'; end if;
 if coalesce(d->>'price','')<>'' and (d->>'price') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'networkInvalid'; end if;
 return d;
end $$;

create function private.network_gateway(p_shop uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); owner_access boolean; share_access boolean; adm boolean;
 target uuid; item_id uuid; off_n int; q text; section text; items jsonb;
 profile private.network_profiles; conn private.network_connections;
 v_device jsonb; recipients uuid[]; other uuid; action_name text:=p_action;
begin
 if v_actor is null then raise exception 'noAccess'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>10000 then raise exception 'networkInvalid'; end if;
 adm:=exists(select 1 from private.platform_administrators where user_id=v_actor and active);
 if p_action like 'admin-%' then
  if not adm then raise exception 'noAccess'; end if;
 else
  if p_shop is null or not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 end if;
 owner_access:=public.shop_access(p_shop,true);
 share_access:=owner_access or exists(select 1 from private.network_permissions where shop_id=p_shop and user_id=v_actor and can_share);
 off_n:=greatest(0,least(coalesce((p_data->>'offset')::int,0),100000));
 q:=left(coalesce(p_data->>'query',''),80);
 if p_action='status' then
  return jsonb_build_object('profile',(select to_jsonb(p) from private.network_profiles p where shop_id=p_shop),
   'canShare',share_access,'owner',owner_access,
   'members',case when owner_access then (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'phone',u.phone,'can_share',coalesce(n.can_share,false))),'[]') from public.memberships m join auth.users u on u.id=m.user_id left join private.network_permissions n using(shop_id,user_id) where m.shop_id=p_shop and m.active) else '[]'::jsonb end);
 end if;
 if p_action='list' then
  section:=p_data->>'section';
  if section not in ('directory','connections','board','audit') then raise exception 'networkInvalid'; end if;
  if section='audit' then
   if not owner_access then raise exception 'noAccess'; end if;
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (select action,details,at from private.network_audit where shop_id=p_shop order by id desc limit 26 offset off_n) r;
  elsif section='directory' then
   if not private.network_active(p_shop) then raise exception 'networkApproval'; end if;
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (
    select p.shop_id,p.name,p.area,p.contact,p.status,c.status as connection_status,c.requested_by,c.version as connection_version
    from private.network_profiles p left join private.network_connections c on c.low_id=least(p_shop,p.shop_id) and c.high_id=greatest(p_shop,p.shop_id)
    where p.shop_id<>p_shop and p.enabled and p.status='approved'
    and (q='' or position(lower(q) in lower(p.name||' '||p.area))>0)
    and not exists(select 1 from private.network_blocks b where (b.shop_id=p_shop and b.target_id=p.shop_id) or (b.shop_id=p.shop_id and b.target_id=p_shop))
    order by p.name,p.shop_id limit 26 offset off_n) r;
  elsif section='connections' then
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (
    select p.shop_id,p.name,p.area,p.contact,p.status,c.status as connection_status,c.requested_by,c.version as connection_version,
      exists(select 1 from private.network_blocks b where b.shop_id=p_shop and b.target_id=p.shop_id) as blocked
    from private.network_connections c join private.network_profiles p on p.shop_id=case when c.low_id=p_shop then c.high_id else c.low_id end
    where (c.low_id=p_shop or c.high_id=p_shop)
    and (private.network_active(p.shop_id) or exists(select 1 from private.network_blocks b where b.shop_id=p_shop and b.target_id=p.shop_id))
    and not exists(select 1 from private.network_blocks b where b.shop_id=p.shop_id and b.target_id=p_shop)
    order by c.updated_at desc,p.shop_id limit 26 offset off_n) r;
  elsif section='board' then
   if not private.network_active(p_shop) then raise exception 'networkApproval'; end if;
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (
    select p.id,p.shop_id,n.name,p.kind,p.device,p.expires_at,p.created_at
    from private.network_posts p join private.network_profiles n on n.shop_id=p.shop_id
    where not p.closed and p.expires_at>now() and (p.shop_id=p_shop or
     (private.network_connected(p_shop,p.shop_id) and exists(select 1 from private.network_audience a where a.post_id=p.id and a.shop_id=p_shop)))
    and (q='' or position(lower(q) in lower((p.device->>'brand')||' '||(p.device->>'model')))>0)
    order by p.created_at desc,p.id desc limit 26 offset off_n) r;
  end if;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality a(v,n) where n<=25),'next',case when jsonb_array_length(items)>25 then off_n+25 end);
 end if;
 if p_action='admin-list' then
  section:=coalesce(p_data->>'section','profiles');
  if section='profiles' then
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (select * from private.network_profiles where q='' or position(lower(q) in lower(name||' '||area))>0 order by updated_at desc,shop_id limit 26 offset off_n) r;
  elsif section='reports' then
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (select r.*,n.name as target_name from private.network_reports r join private.network_profiles n on n.shop_id=r.target_id where not r.resolved order by r.created_at desc,r.id limit 26 offset off_n) r;
  elsif section='audit' then
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (select * from private.network_audit order by id desc limit 26 offset off_n) r;
  else raise exception 'networkInvalid'; end if;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality a(v,n) where n<=25),'next',case when jsonb_array_length(items)>25 then off_n+25 end);
 end if;
 -- Serialize low-volume network writes so consent/revocation and rate limits cannot race.
 perform pg_advisory_xact_lock(hashtextextended('private-shop-network',0));
 -- Permissions may have been revoked while this call was waiting for a writer.
 if p_action like 'admin-%' then
  if not exists(select 1 from private.platform_administrators where user_id=v_actor and active) then raise exception 'noAccess'; end if;
 elsif not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 owner_access:=public.shop_access(p_shop,true);
 share_access:=owner_access or exists(select 1 from private.network_permissions where shop_id=p_shop and user_id=v_actor and can_share);
 if (select count(*) from private.network_audit a where a.actor=v_actor and a.at>now()-interval '1 minute')>=40 then raise exception 'networkRate'; end if;
 target:=nullif(p_data->>'target','')::uuid; item_id:=nullif(p_data->>'id','')::uuid;
 if p_action='admin-review' then
  if p_data->>'status' not in ('approved','suspended') or length(trim(coalesce(p_data->>'reason',''))) not between 3 and 500 then raise exception 'networkInvalid'; end if;
  update private.network_profiles set status=p_data->>'status',version=version+1,updated_at=now() where shop_id=target and version=(p_data->>'version')::int;
  if not found then raise exception 'versionConflict'; end if;
 elsif p_action='admin-resolve' then
  update private.network_reports set resolved=true where id=item_id;
  if not found then raise exception 'networkUnavailable'; end if;
 elsif p_action='profile' then
  if not owner_access then raise exception 'noAccess'; end if;
  if coalesce(length(trim(p_data->>'name')),0) not between 1 and 80 or coalesce(length(trim(p_data->>'area')),0) not between 1 and 100 or coalesce(length(p_data->>'contact'),0)>60 then raise exception 'networkInvalid'; end if;
  select * into profile from private.network_profiles where shop_id=p_shop;
  if coalesce(profile.version,0)<>coalesce((p_data->>'version')::int,0) then raise exception 'versionConflict'; end if;
  insert into private.network_profiles(shop_id,name,area,contact,enabled) values(p_shop,trim(p_data->>'name'),trim(p_data->>'area'),coalesce(p_data->>'contact',''),coalesce((p_data->>'enabled')::boolean,true))
  on conflict(shop_id) do update set name=excluded.name,area=excluded.area,contact=excluded.contact,enabled=excluded.enabled,
   status=case when network_profiles.status='suspended' then 'suspended' when (network_profiles.name,network_profiles.area,network_profiles.contact) is distinct from (excluded.name,excluded.area,excluded.contact) then 'pending' else network_profiles.status end,
   version=network_profiles.version+1,updated_at=now();
 elsif p_action='permission' then
  if not owner_access or not exists(select 1 from public.memberships where shop_id=p_shop and user_id=target and active and role='staff') then raise exception 'noAccess'; end if;
  insert into private.network_permissions values(p_shop,target,(p_data->>'enabled')::boolean) on conflict(shop_id,user_id) do update set can_share=excluded.can_share;
 elsif p_action in ('connect','accept','disconnect','block','unblock') then
  if not owner_access or target is null or target=p_shop then raise exception 'noAccess'; end if;
  select * into conn from private.network_connections where low_id=least(p_shop,target) and high_id=greatest(p_shop,target);
  if p_action='unblock' then delete from private.network_blocks where shop_id=p_shop and target_id=target;
  elsif p_action='block' then
   if not exists(select 1 from private.network_profiles where shop_id=target) then raise exception 'networkUnavailable'; end if;
   insert into private.network_blocks values(p_shop,target) on conflict do nothing;
   insert into private.network_connections(low_id,high_id,requested_by,status) values(least(p_shop,target),greatest(p_shop,target),p_shop,'disconnected') on conflict(low_id,high_id) do update set status='disconnected',version=network_connections.version+1,updated_at=now();
  else
   if coalesce(conn.version,0)<>coalesce((p_data->>'version')::int,0) then raise exception 'versionConflict'; end if;
   if p_action<>'disconnect' and (not private.network_active(p_shop) or not private.network_active(target) or exists(select 1 from private.network_blocks where (shop_id=p_shop and target_id=target) or (shop_id=target and target_id=p_shop))) then raise exception 'networkUnavailable'; end if;
   if p_action='connect' then
    if conn.status in ('pending','accepted') then raise exception 'versionConflict'; end if;
    if (select count(*) from private.network_audit a where a.actor=v_actor and a.action='connect' and a.at>now()-interval '1 day')>=10 then raise exception 'networkRate'; end if;
    insert into private.network_connections(low_id,high_id,requested_by,status) values(least(p_shop,target),greatest(p_shop,target),p_shop,'pending') on conflict(low_id,high_id) do update set requested_by=p_shop,status='pending',version=network_connections.version+1,updated_at=now();
   elsif p_action='accept' then
    if conn.status is distinct from 'pending' or conn.requested_by=p_shop then raise exception 'networkUnavailable'; end if;
    update private.network_connections set status='accepted',version=version+1,updated_at=now() where low_id=conn.low_id and high_id=conn.high_id;
   else
    update private.network_connections set status='disconnected',version=version+1,updated_at=now() where low_id=conn.low_id and high_id=conn.high_id;
   end if;
  end if;
 elsif p_action='report' then
  if target is null or target=p_shop or item_id is null or coalesce(length(trim(p_data->>'reason')),0) not between 3 and 500 or not exists(select 1 from private.network_profiles where shop_id=target) then raise exception 'networkInvalid'; end if;
  if (select count(*) from private.network_audit a where a.actor=v_actor and a.action='report' and a.at>now()-interval '1 day')>=10 then raise exception 'networkRate'; end if;
  insert into private.network_reports(id,shop_id,target_id,reason) values(item_id,p_shop,target,trim(p_data->>'reason')) on conflict(id) do nothing;
 elsif p_action='post' then
  if not share_access or not private.network_active(p_shop) then raise exception 'noAccess'; end if;
  v_device:=private.network_device(p_data->'device');
  select array_agg(distinct value::uuid) into recipients from jsonb_array_elements_text(p_data->'recipients');
  if item_id is null or coalesce(cardinality(recipients),0) not between 1 and 50 or p_data->>'kind' not in ('offer','request') then raise exception 'networkInvalid'; end if;
  foreach other in array recipients loop
   if not private.network_connected(p_shop,other) then raise exception 'networkUnavailable'; end if;
  end loop;
  if exists(select 1 from private.network_posts where id=item_id) then
   if not exists(select 1 from private.network_posts where id=item_id and shop_id=p_shop and kind=p_data->>'kind' and network_posts.device=v_device) then raise exception 'versionConflict'; end if;
   if (select array_agg(a.shop_id order by a.shop_id) from private.network_audience a where a.post_id=item_id) is distinct from (select array_agg(r order by r) from unnest(recipients) r) then raise exception 'versionConflict'; end if;
   return jsonb_build_object('ok',true);
  end if;
  if (select count(*) from private.network_posts where shop_id=p_shop and created_at>now()-interval '1 day')>=20 then raise exception 'networkRate'; end if;
  insert into private.network_posts(id,shop_id,kind,device) values(item_id,p_shop,p_data->>'kind',v_device);
  insert into private.network_audience select item_id,unnest(recipients);
 elsif p_action='close-post' then
  if not share_access then raise exception 'noAccess'; end if;
  update private.network_posts set closed=true where id=item_id and shop_id=p_shop;
  if not found then raise exception 'networkUnavailable'; end if;
 else raise exception 'networkInvalid'; end if;
 -- No biometric/customer content or full IMEI is copied into activity logs.
 insert into private.network_audit(actor,shop_id,action,details) values(v_actor,p_shop,action_name,
  jsonb_strip_nulls(jsonb_build_object('target',target,'id',item_id,'status',p_data->>'status','reason',case when p_action like 'admin-%' then p_data->>'reason' end,'recipients',p_data->'recipients')));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function private.network_active(uuid),private.network_connected(uuid,uuid),private.network_device(jsonb),private.network_gateway(uuid,text,jsonb) from public,anon,authenticated;
-- Public invoker wrapper exposes only the guarded private gateway, never the tables.
create function public.shop_network(p_shop uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.network_gateway(p_shop,p_action,p_data); $$;
grant usage on schema private to authenticated;
grant execute on function private.network_gateway(uuid,text,jsonb) to authenticated;
revoke all on function public.shop_network(uuid,text,jsonb) from public,anon;
grant execute on function public.shop_network(uuid,text,jsonb) to authenticated;
