-- Administrator-issued login codes. No code or session token is stored in clear text.
create table private.login_codes (
  user_id uuid primary key references auth.users(id),
  phone text unique not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz,
  issued_by uuid references auth.users(id),
  issued_at timestamptz not null default now()
);
create table private.login_code_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  actor_id uuid references auth.users(id),
  action text not null check (action in ('issued','redeemed','locked')),
  at timestamptz not null default now()
);
create table private.platform_administrators (
  user_id uuid primary key references auth.users(id),
  active boolean not null default true
);
alter table private.login_codes enable row level security;
alter table private.login_code_audit enable row level security;
alter table private.platform_administrators enable row level security;
revoke all on private.login_codes, private.login_code_audit, private.platform_administrators from public,anon,authenticated;
grant select,insert,update,delete on private.login_codes to service_role;
grant select,insert on private.login_code_audit to service_role;
grant usage,select on sequence private.login_code_audit_id_seq to service_role;
grant select on private.platform_administrators to service_role;

create function public.is_platform_administrator(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.platform_administrators where user_id=p_user and active);
$$;
create function public.issue_login_code(p_user uuid,p_phone text,p_hash text,p_actor uuid default null)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare expiry timestamptz:=now()+interval '1 hour';
begin
 if not exists(select 1 from public.memberships where user_id=p_user and active)
    or not exists(select 1 from public.account_status where user_id=p_user)
 then raise exception 'noAccess'; end if;
 insert into private.login_codes(user_id,phone,code_hash,expires_at,issued_by)
 values(p_user,p_phone,p_hash,expiry,p_actor)
 on conflict(user_id) do update set phone=excluded.phone,code_hash=excluded.code_hash,
 expires_at=excluded.expires_at,attempts=0,consumed_at=null,issued_by=excluded.issued_by,issued_at=now();
 insert into private.login_code_audit(user_id,actor_id,action) values(p_user,p_actor,'issued');
 return expiry;
end; $$;
create function public.consume_login_code(p_phone text,p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c private.login_codes;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into c from private.login_codes where phone=p_phone for update;
 if not found or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 then return null; end if;
 if c.code_hash<>p_hash then
   update private.login_codes set attempts=attempts+1 where user_id=c.user_id;
   if c.attempts=4 then insert into private.login_code_audit(user_id,action) values(c.user_id,'locked'); end if;
   return null;
 end if;
 if not exists(select 1 from public.memberships where user_id=c.user_id and active) then return null; end if;
 update private.login_codes set consumed_at=now() where user_id=c.user_id;
 insert into private.login_code_audit(user_id,action) values(c.user_id,'redeemed');
 return c.user_id;
end; $$;
revoke all on function public.is_platform_administrator(uuid),public.issue_login_code(uuid,text,text,uuid),public.consume_login_code(text,text) from public,anon,authenticated;
grant execute on function public.is_platform_administrator(uuid),public.issue_login_code(uuid,text,text,uuid),public.consume_login_code(text,text) to service_role;

create index login_codes_issued_by on private.login_codes(issued_by);
create index login_code_audit_user on private.login_code_audit(user_id);
create index login_code_audit_actor on private.login_code_audit(actor_id);
