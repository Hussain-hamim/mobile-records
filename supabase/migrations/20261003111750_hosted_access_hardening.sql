-- Hosted projects may automatically grant ALL to API roles. Reset those grants
-- explicitly: RLS does not protect TRUNCATE and should not be the only barrier.
revoke all on public.account_status, public.shops, public.memberships,
  public.customers, public.records, public.amendments, public.applied_operations
  from public, anon, authenticated;
grant select on public.account_status, public.memberships to authenticated;
grant select, update on public.shops to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert on public.records, public.amendments, public.applied_operations
  to authenticated;
-- Account provisioning and recovery execute only in the trusted backend.
grant select, insert, update, delete on public.account_status, public.shops,
  public.memberships, public.customers, public.records, public.amendments,
  public.applied_operations to service_role;

create index memberships_user on public.memberships(user_id);
create index records_created_by on public.records(created_by);
create index amendments_created_by on public.amendments(created_by);
create index amendments_shop_record on public.amendments(shop_id, record_id);
