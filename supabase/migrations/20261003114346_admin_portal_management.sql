create table private.admin_activity (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 shop_id uuid not null references public.shops(id),
 user_id uuid not null references auth.users(id),
 action text not null check(action in ('access_enabled','access_disabled')),
 reason text not null check(length(trim(reason)) between 1 and 500),
 at timestamptz not null default now()
);
alter table private.admin_activity enable row level security;
revoke all on private.admin_activity from public,anon,authenticated;
grant select,insert on private.admin_activity to service_role;
grant usage,select on sequence private.admin_activity_id_seq to service_role;
create index admin_activity_actor on private.admin_activity(actor_id);
create index admin_activity_shop on private.admin_activity(shop_id);
create index admin_activity_user on private.admin_activity(user_id);
create function public.admin_set_access(p_shop uuid,p_user uuid,p_active boolean,p_reason text,p_actor uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_active is null or coalesce(length(trim(p_reason)),0) not between 1 and 500 then raise exception 'A reason is required'; end if;
 if exists(select 1 from private.platform_administrators where user_id=p_user and active) then raise exception 'Platform administrator access is managed separately'; end if;
 update public.memberships set active=p_active where shop_id=p_shop and user_id=p_user;
 if not found then raise exception 'Account not found'; end if;
 insert into private.admin_activity(actor_id,shop_id,user_id,action,reason) values(p_actor,p_shop,p_user,case when p_active then 'access_enabled' else 'access_disabled' end,trim(p_reason));
end; $$;
create function public.admin_overview() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('shops',(select count(*) from public.shops),
 'accounts',(select count(distinct user_id) from public.memberships),
 'activeAccounts',(select count(distinct user_id) from public.memberships where active),
 'records',(select count(*) from public.records),
 'pendingCodes',(select count(*) from private.login_codes where consumed_at is null and attempts<5 and expires_at>now()),
 'recentActivity',(select coalesce(jsonb_agg(e order by e.at desc),'[]'::jsonb) from (
   select action,user_id,at from private.login_code_audit
   union all select action,user_id,at from private.admin_activity
   order by at desc limit 12
 ) e));
$$;
revoke all on function public.admin_set_access(uuid,uuid,boolean,text,uuid), public.admin_overview() from public,anon,authenticated;
grant execute on function public.admin_set_access(uuid,uuid,boolean,text,uuid), public.admin_overview() to service_role;
