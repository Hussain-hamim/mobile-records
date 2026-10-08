-- Only a server-authenticated, active member may use the narrow lookup RPC.
-- Full shop/record RLS policies remain unchanged.
create table private.previous_shop_feature (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
insert into private.previous_shop_feature(singleton) values(true);
create table private.previous_shop_feature_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 enabled boolean not null,
 at timestamptz not null default clock_timestamp()
);
create table private.previous_shop_lookup_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 shop_id uuid references public.shops(id) on delete set null,
 outcome text not null check(outcome in ('disabled','invalid','rate_limited','matched','not_found','denied')),
 at timestamptz not null default clock_timestamp()
);
create index previous_shop_lookup_rate on private.previous_shop_lookup_audit(actor_id,at desc);
create index previous_shop_lookup_shop on private.previous_shop_lookup_audit(shop_id);
create index previous_shop_feature_actor on private.previous_shop_feature_audit(actor_id);
create index previous_shop_feature_updater on private.previous_shop_feature(updated_by);
create table private.previous_shop_imeis (
 record_id uuid not null references public.records(id) on delete cascade,
 imei text not null check(imei ~ '^[0-9]{15}$'),
 shop_id uuid not null references public.shops(id) on delete cascade,
 occurred_at timestamptz not null,
 recorded_at timestamptz not null,
 direction text not null check(direction in ('buy','sell')),
 primary key(record_id,imei)
);
create index previous_shop_imei_latest on private.previous_shop_imeis(imei,occurred_at desc,recorded_at desc,record_id desc);
create index previous_shop_imei_shop on private.previous_shop_imeis(shop_id);
alter table private.previous_shop_feature enable row level security;
alter table private.previous_shop_feature_audit enable row level security;
alter table private.previous_shop_lookup_audit enable row level security;
alter table private.previous_shop_imeis enable row level security;
revoke all on private.previous_shop_feature, private.previous_shop_feature_audit, private.previous_shop_lookup_audit, private.previous_shop_imeis from public,anon,authenticated;
grant select,update on private.previous_shop_feature to service_role;
grant select,insert on private.previous_shop_feature_audit,private.previous_shop_lookup_audit to service_role;
grant select on private.previous_shop_imeis to service_role;
grant usage,select on sequence private.previous_shop_feature_audit_id_seq,private.previous_shop_lookup_audit_id_seq to service_role;

create function private.refresh_previous_shop_record(p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.records; s jsonb; stamp timestamptz;
begin
 select * into r from public.records where id=p_id;
 delete from private.previous_shop_imeis where record_id=p_id;
 if r.id is null or exists(select 1 from public.amendments where shop_id=r.shop_id and record_id=p_id and payload->>'kind'='void') then return; end if;
 select payload->'snapshot' into s from public.amendments
 where shop_id=r.shop_id and record_id=p_id and coalesce(payload->>'kind','correction')='correction'
 order by created_at desc,id desc limit 1;
 s:=coalesce(s,r.snapshot);
 -- Older snapshots were not constrained to a timestamp format.
 begin stamp:=coalesce((s->>'occurredAt')::timestamptz,r.created_at);
 exception when invalid_datetime_format or datetime_field_overflow then stamp:=r.created_at; end;
 if not isfinite(stamp) then stamp:=r.created_at; end if;
 insert into private.previous_shop_imeis(record_id,imei,shop_id,occurred_at,recorded_at,direction)
 select distinct r.id,v,r.shop_id,stamp,r.created_at,s->>'direction'
 from unnest(array[s->'phone'->>'imei1',s->'phone'->>'imei2']) v
 where v ~ '^[0-9]{15}$';
end; $$;

create function private.previous_shop_record_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Trigger-only elevated writes; ordinary callers must still own a membership.
 if coalesce(current_setting('role',true),'none') not in ('none','service_role')
 and (auth.uid() is null or not public.shop_access(new.shop_id)) then raise exception 'noAccess'; end if;
 if tg_table_name='records' then
   perform private.refresh_previous_shop_record(new.id);
 else
   perform private.refresh_previous_shop_record(new.record_id);
 end if;
 return new;
end; $$;
revoke all on function private.refresh_previous_shop_record(uuid),private.previous_shop_record_changed() from public,anon,authenticated;
create trigger previous_shop_record after insert on public.records for each row execute function private.previous_shop_record_changed();
create trigger previous_shop_amendment after insert on public.amendments for each row execute function private.previous_shop_record_changed();
do $$ declare r record; begin
 for r in select id from public.records loop perform private.refresh_previous_shop_record(r.id); end loop;
end; $$;

create function public.previous_shop_admin(p_actor uuid,p_enabled boolean default null,p_version integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f private.previous_shop_feature;
begin
 if not coalesce(public.is_platform_administrator(p_actor),false) then return jsonb_build_object('error','noAccess'); end if;
 select * into f from private.previous_shop_feature where singleton for update;
 if p_enabled is not null then
   if p_version is distinct from f.version then return jsonb_build_object('error','conflict'); end if;
   if f.enabled is distinct from p_enabled then
     update private.previous_shop_feature set enabled=p_enabled,version=version+1,updated_at=clock_timestamp(),updated_by=p_actor where singleton returning * into f;
     insert into private.previous_shop_feature_audit(actor_id,enabled) values(p_actor,p_enabled);
   end if;
 end if;
 return jsonb_build_object('enabled',f.enabled,'version',f.version,'updatedAt',f.updated_at,'updatedBy',f.updated_by);
end; $$;

create function public.previous_shop_lookup(p_actor uuid,p_shop uuid,p_imeis text[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare enabled boolean; found jsonb; outcome text; n integer;
begin
 if not exists(select 1 from public.memberships m join public.account_status a on a.user_id=m.user_id
   where m.user_id=p_actor and m.shop_id=p_shop and m.active and not a.must_change_password)
 then
   if p_imeis is not null then
     insert into private.previous_shop_lookup_audit(actor_id,shop_id,outcome)
     values((select user_id from public.account_status where user_id=p_actor),(select id from public.shops where id=p_shop),'denied');
   end if;
   return jsonb_build_object('error','noAccess');
 end if;
 -- Status reads have the same membership gate and return no data from other shops.
 select f.enabled into enabled from private.previous_shop_feature f where singleton;
 if p_imeis is null then return jsonb_build_object('enabled',coalesce(enabled,false)); end if;
 perform pg_advisory_xact_lock(hashtextextended('previous-shop:'||p_actor::text,0));
 -- Re-read after waiting for concurrent requests, so a disabled switch cannot be stale.
 select f.enabled into enabled from private.previous_shop_feature f where singleton;
 select count(*) into n from private.previous_shop_lookup_audit a where a.actor_id=p_actor and a.at>clock_timestamp()-interval '1 minute' and a.outcome<>'rate_limited';
 if n>=30 then outcome:='rate_limited';
 elsif not coalesce(enabled,false) then outcome:='disabled';
 elsif cardinality(p_imeis) not between 1 and 2 or exists(select 1 from unnest(p_imeis) v where v is null or v !~ '^[0-9]{15}$') then outcome:='invalid';
 else
   select coalesce(jsonb_agg(jsonb_build_object('imeis',q.imeis,'shopName',coalesce(s.profile->>'shopName',''),
     'phone',coalesce(s.profile->>'phone',''),'address',coalesce(s.profile->>'address',''),
     'occurredAt',q.occurred_at,'direction',q.direction) order by q.occurred_at desc,q.record_id desc),'[]'::jsonb) into found
   from (
     select chosen.record_id,chosen.shop_id,chosen.occurred_at,chosen.direction,array_agg(chosen.imei order by chosen.imei) as imeis
     from (
       select distinct on (i.imei) i.* from private.previous_shop_imeis i
       where i.imei=any(p_imeis) and i.shop_id<>p_shop
       order by i.imei,i.occurred_at desc,i.recorded_at desc,i.record_id desc
     ) chosen group by chosen.record_id,chosen.shop_id,chosen.occurred_at,chosen.direction
   ) q join public.shops s on s.id=q.shop_id;
   outcome:=case when jsonb_array_length(found)>0 then 'matched' else 'not_found' end;
 end if;
 insert into private.previous_shop_lookup_audit(actor_id,shop_id,outcome) values(p_actor,p_shop,outcome);
 if outcome='rate_limited' then return jsonb_build_object('error','previousShopRateLimited'); end if;
 if outcome='disabled' then return jsonb_build_object('enabled',false,'matches','[]'::jsonb); end if;
 if outcome='invalid' then return jsonb_build_object('error','invalidImei'); end if;
 return jsonb_build_object('enabled',true,'matches',found);
end; $$;
revoke all on function public.previous_shop_admin(uuid,boolean,integer),public.previous_shop_lookup(uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.previous_shop_admin(uuid,boolean,integer),public.previous_shop_lookup(uuid,uuid,text[]) to service_role;

create or replace function public.admin_overview() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('shops',(select count(*) from public.shops),
 'accounts',(select count(distinct user_id) from public.memberships),
 'activeAccounts',(select count(distinct user_id) from public.memberships where active),
 'records',(select count(*) from public.records),
 'pendingCodes',(select count(*) from private.login_codes where consumed_at is null and attempts<5 and expires_at>now()),
 'recentActivity',(select coalesce(jsonb_agg(e order by e.at desc),'[]'::jsonb) from (
   select action,user_id,at from private.login_code_audit
   union all select action,user_id,at from private.admin_activity
   union all select case when enabled then 'previous_shop_enabled' else 'previous_shop_disabled' end,actor_id,at from private.previous_shop_feature_audit
   order by at desc limit 12
 ) e));
$$;
