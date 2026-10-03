create table public.transaction_drafts (
 shop_id uuid not null references public.shops(id),
 user_id uuid not null references auth.users(id),
 id uuid not null,
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(shop_id,user_id,id),
 check(coalesce(jsonb_typeof(payload)='object' and payload->>'id'=id::text,false))
);
create index transaction_drafts_user on public.transaction_drafts(user_id);
alter table public.transaction_drafts enable row level security;
revoke all on public.transaction_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.transaction_drafts to authenticated,service_role;
create policy draft_read on public.transaction_drafts for select to authenticated using(user_id=(select auth.uid()) and public.shop_access(shop_id));
create policy draft_insert on public.transaction_drafts for insert to authenticated with check(user_id=(select auth.uid()) and public.shop_access(shop_id));
create policy draft_update on public.transaction_drafts for update to authenticated using(user_id=(select auth.uid()) and public.shop_access(shop_id)) with check(user_id=(select auth.uid()) and public.shop_access(shop_id));
create policy draft_delete on public.transaction_drafts for delete to authenticated using(user_id=(select auth.uid()) and public.shop_access(shop_id));

-- One transaction commits customer changes, the immutable record and draft removal.
-- apply_operation retains existing role, version, fingerprint and replay checks.
create function public.save_cloud_changes(p_shop uuid,p_operations jsonb,p_drafts jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare op jsonb; d jsonb; target uuid;
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_typeof(p_drafts) is distinct from 'array'
 or jsonb_array_length(p_operations)>10 or jsonb_array_length(p_drafts)>10 then raise exception 'Invalid batch'; end if;
 for op in select value from jsonb_array_elements(p_operations) loop
   perform public.apply_operation(p_shop,op->>'id',op->>'kind',op->'payload',(op->>'baseVersion')::integer);
 end loop;
 for d in select value from jsonb_array_elements(p_drafts) loop
   target:=(d->>'id')::uuid;
   -- Serialize finalization with any late autosave of the same staff draft.
   perform pg_advisory_xact_lock(hashtextextended(p_shop::text||auth.uid()::text||target::text,0));
   if d->'value'='null'::jsonb or exists(select 1 from public.records where shop_id=p_shop and id=target) then
     delete from public.transaction_drafts where shop_id=p_shop and user_id=auth.uid() and id=target;
   else
     insert into public.transaction_drafts(shop_id,user_id,id,payload) values(p_shop,auth.uid(),target,d->'value')
     on conflict(shop_id,user_id,id) do update set payload=excluded.payload,updated_at=now();
   end if;
 end loop;
end; $$;
revoke all on function public.save_cloud_changes(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_cloud_changes(uuid,jsonb,jsonb) to authenticated;
