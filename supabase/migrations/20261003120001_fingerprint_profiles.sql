-- Keep the legacy projection for older clients; v2 is authoritative once present.
alter table public.customers add column fingerprints jsonb;
alter table public.customers add column fingerprint_audit jsonb not null default '[]';
alter table public.customers add column fingerprint_change_reason text not null default '';
update public.customers set fingerprints = case when coalesce(fingerprint_template,'') <> '' then
 jsonb_build_array(jsonb_build_object('id','legacy-'||id::text,'slot','primary','template',fingerprint_template,'enrolledAt',null,'enrolledBy',null)) else '[]'::jsonb end,
 version=version+1;

create function public.protect_fingerprints() returns trigger language plpgsql security invoker set search_path='' as $$
declare prev jsonb := '[]'; result jsonb := '[]'; old_entry jsonb; entry jsonb; slot text; audit jsonb := '[]'; action text;
begin
 if tg_op='UPDATE' then prev:=coalesce(old.fingerprints,'[]'); audit:=old.fingerprint_audit; end if;
 if new.fingerprints is null then
   if tg_op='UPDATE' then new.fingerprints:=prev;
   elsif coalesce(new.fingerprint_template,'')<>'' then
     new.fingerprints:=jsonb_build_array(jsonb_build_object('id','legacy-'||new.id::text,'slot','primary','template',new.fingerprint_template,'enrolledAt',now(),'enrolledBy',auth.uid()));
   else new.fingerprints:='[]'; end if;
 end if;
 if jsonb_typeof(new.fingerprints)<>'array' or jsonb_array_length(new.fingerprints)>2 then raise exception 'fingerprintInvalid'; end if;
 if (select count(*)<>count(distinct e->>'slot') or count(*)<>count(distinct e->>'id') from jsonb_array_elements(new.fingerprints) e) then raise exception 'fingerprintInvalid'; end if;
 for entry in select * from jsonb_array_elements(new.fingerprints) loop
   if jsonb_typeof(entry)<>'object' or jsonb_typeof(entry->'id')<>'string' or jsonb_typeof(entry->'template')<>'string' or coalesce(entry->>'slot','') not in ('primary','backup') or coalesce(length(entry->>'id'),0) not between 1 and 100 or coalesce(length(trim(entry->>'template')),0) not between 1 and 8192
   or entry - array['id','slot','template','enrolledAt','enrolledBy'] <> '{}'::jsonb then raise exception 'fingerprintInvalid'; end if;
 end loop;
 foreach slot in array array['primary','backup'] loop
   select e into old_entry from jsonb_array_elements(prev) e where e->>'slot'=slot;
   select e into entry from jsonb_array_elements(new.fingerprints) e where e->>'slot'=slot;
   if old_entry is distinct from entry then
     if old_entry is not null and not public.shop_access(new.shop_id,true) then raise exception 'fingerprintOwnerOnly'; end if;
     if old_entry is not null and coalesce(length(trim(new.fingerprint_change_reason)),0)=0 then raise exception 'fingerprintReasonRequired'; end if;
     if length(new.fingerprint_change_reason)>500 then raise exception 'fingerprintInvalid'; end if;
     if entry is not null and ((entry->>'enrolledBy') is distinct from auth.uid()::text or coalesce(entry->>'enrolledAt','')='') then raise exception 'fingerprintInvalid'; end if;
     if entry is not null then perform (entry->>'enrolledAt')::timestamptz; end if;
     action:=case when old_entry is null then 'add' when entry is null then 'remove' else 'replace' end;
     audit:=audit||jsonb_build_array(jsonb_build_object('slot',slot,'action',action,'reason',new.fingerprint_change_reason,'at',now(),'by',auth.uid()));
   end if;
 end loop;
 new.fingerprint_audit:=audit;
 select e->>'template' into new.fingerprint_template from jsonb_array_elements(new.fingerprints) e order by case when e->>'slot'='primary' then 0 else 1 end limit 1;
 return new;
end; $$;
create trigger customer_fingerprints before insert or update on public.customers for each row execute function public.protect_fingerprints();
revoke all on function public.protect_fingerprints() from public,anon;

create or replace function public.apply_operation(p_shop uuid,p_id text,p_kind text,p_payload jsonb,p_base_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous public.applied_operations; v integer:=1; target uuid; hash text:=md5(p_kind||p_payload::text||p_base_version::text); existing jsonb;
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text||p_id,0));
 select * into previous from public.applied_operations where shop_id=p_shop and id=p_id;
 if found then
   if previous.payload_hash<>hash then raise exception 'conflict: operation payload changed'; end if;
   return jsonb_build_object('version',previous.result_version);
 end if;
 target:=(p_payload->>'id')::uuid;
 if p_kind='record' then
   select snapshot into existing from public.records where id=target and shop_id=p_shop;
   if found then if existing<>p_payload then raise exception 'conflict: immutable record'; end if;
   else insert into public.records(id,shop_id,created_by,snapshot) values(target,p_shop,auth.uid(),p_payload); end if;
 elsif p_kind='customer' then
   if p_base_version=0 then
     insert into public.customers(id,shop_id,person,fingerprint_template,fingerprints,fingerprint_change_reason)
     values(target,p_shop,p_payload->'person', nullif(p_payload->>'fingerprintTemplate',''), p_payload->'fingerprints', coalesce(p_payload->>'fingerprintReason',''))
     on conflict(id) do nothing returning version into v;
   else
     update public.customers
     set person=p_payload->'person',
         fingerprints=case when p_payload ? 'fingerprints' then p_payload->'fingerprints' else fingerprints end,
         fingerprint_change_reason=coalesce(p_payload->>'fingerprintReason',''),
         version=version+1
     where id=target and shop_id=p_shop and version=p_base_version returning version into v;
   end if;
   if v is null then raise exception 'conflict: customer changed'; end if;
 elsif p_kind='shop' then
   if target<>p_shop or not public.shop_access(p_shop,true) then raise exception 'noAccess'; end if;
   update public.shops set profile=p_payload->'profile',version=version+1 where id=p_shop and version=p_base_version returning version into v;
   if v is null then raise exception 'conflict: shop changed'; end if;
 elsif p_kind='amendment' then
   insert into public.amendments(id,shop_id,record_id,created_by,payload) values(target,p_shop,(p_payload->>'recordId')::uuid,auth.uid(),p_payload);
 else raise exception 'Unknown operation'; end if;
 insert into public.applied_operations values(p_shop,p_id,hash,v);
 return jsonb_build_object('version',v);
end; $$;
