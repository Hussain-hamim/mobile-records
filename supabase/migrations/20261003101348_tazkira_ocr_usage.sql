-- No document content is stored here. Only the backend can reserve OCR usage.
create schema if not exists private;
create table private.tazkira_ocr_usage (
  request_id uuid primary key,
  user_id uuid not null,
  shop_id uuid not null,
  reserved_at timestamptz not null default now()
);
create index tazkira_ocr_usage_time on private.tazkira_ocr_usage (reserved_at);
create index tazkira_ocr_usage_user_time on private.tazkira_ocr_usage (user_id, reserved_at);
alter table private.tazkira_ocr_usage enable row level security;
revoke all on private.tazkira_ocr_usage from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on private.tazkira_ocr_usage to service_role;

create function public.reserve_tazkira_ocr(p_request_id uuid, p_user_id uuid, p_shop_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize the quota check and reservation across concurrent Edge workers.
  perform pg_advisory_xact_lock(794321006);
  if not exists (select 1 from public.memberships where user_id=p_user_id and shop_id=p_shop_id and active)
    or not exists (select 1 from public.account_status where user_id=p_user_id and not must_change_password)
  then return 'noAccess'; end if;
  if exists (select 1 from private.tazkira_ocr_usage where request_id=p_request_id)
  then return 'duplicateScan'; end if;
  if (select count(*) from private.tazkira_ocr_usage where reserved_at > now()-interval '32 days') >= 900
  then return 'onlineQuotaReached'; end if;
  if (select count(*) from private.tazkira_ocr_usage where user_id=p_user_id and reserved_at > now()-interval '1 minute') >= 10
  then return 'onlineRateLimited'; end if;
  insert into private.tazkira_ocr_usage(request_id,user_id,shop_id) values(p_request_id,p_user_id,p_shop_id);
  return 'ok';
end;
$$;
revoke all on function public.reserve_tazkira_ocr(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_tazkira_ocr(uuid,uuid,uuid) to service_role;
