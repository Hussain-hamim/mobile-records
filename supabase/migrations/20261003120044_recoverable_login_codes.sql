-- Optional server-encrypted copy; legacy hashes remain usable without migration.
alter table private.login_codes add column encrypted_code text;

-- Old issuers and consumption/lockout must clear any recoverable prior code.
create function private.clear_invalid_login_code() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.code_hash is distinct from old.code_hash or new.issued_at is distinct from old.issued_at
    or new.consumed_at is not null or new.attempts>=5 or new.expires_at<=now() then
   new.encrypted_code:=null;
 end if;
 return new;
end; $$;
revoke all on function private.clear_invalid_login_code() from public,anon,authenticated;
create trigger clear_invalid_login_code before update on private.login_codes
 for each row execute function private.clear_invalid_login_code();

create function public.issue_recoverable_login_code(p_user uuid,p_phone text,p_hash text,p_encrypted text,p_actor uuid default null)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare expiry timestamptz;
begin
 if p_encrypted is null or p_encrypted !~ '^v1\.[A-Za-z0-9+/]{48}$' then raise exception 'Invalid encrypted code'; end if;
 expiry:=public.issue_login_code(p_user,p_phone,p_hash,p_actor);
 update private.login_codes set encrypted_code=p_encrypted where user_id=p_user;
 return expiry;
end; $$;

create function public.read_active_login_code(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('phone',c.phone,'expiresAt',c.expires_at,'encryptedCode',c.encrypted_code)
 from private.login_codes c
 where c.user_id=p_user and c.consumed_at is null and c.attempts<5 and c.expires_at>now()
 and exists(select 1 from public.memberships m where m.user_id=c.user_id and m.active);
$$;
revoke all on function public.issue_recoverable_login_code(uuid,text,text,text,uuid),public.read_active_login_code(uuid) from public,anon,authenticated;
grant execute on function public.issue_recoverable_login_code(uuid,text,text,text,uuid),public.read_active_login_code(uuid) to service_role;
