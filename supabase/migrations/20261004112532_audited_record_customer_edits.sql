-- Current customer profiles are mutable; historical transaction snapshots are not.
alter table public.customers add column profile_audit jsonb not null default '[]';
alter table public.customers add column profile_change_reason text not null default '';
create function public.protect_customer_profile() returns trigger language plpgsql security invoker set search_path='' as $$
declare changes jsonb := '{}'; k text; before_value text; after_value text;
begin
 if jsonb_typeof(new.person) is distinct from 'object' then raise exception 'requiredFields'; end if;
 if new.person - array['idType','name','fatherName','grandfatherName','idNumber','originalAddress','currentAddress','phone','occupation','workplace','relativePhone','idVolume','idPage','dateOfBirth','gender','nationality'] <> '{}'::jsonb
 or exists(select 1 from jsonb_each(new.person) e where jsonb_typeof(e.value)<>'string') then raise exception 'requiredFields'; end if;
 if tg_op='INSERT' then new.profile_audit:='[]'; new.profile_change_reason:=''; return new; end if;
 new.profile_audit:=old.profile_audit;
 for k in select jsonb_object_keys(old.person || new.person) loop
   before_value:=coalesce(old.person->>k,case when k='idType' then 'enid' else '' end);
   after_value:=coalesce(new.person->>k,case when k='idType' then 'enid' else '' end);
   if before_value is distinct from after_value then
     if k <> all(array['phone','relativePhone','originalAddress','currentAddress','occupation','workplace']) and not public.shop_access(new.shop_id,true) then raise exception 'identityOwnerOnly'; end if;
     changes:=changes||jsonb_build_object(k,jsonb_build_object('before',before_value,'after',after_value));
   end if;
 end loop;
 if changes<>'{}'::jsonb then
   if coalesce(length(trim(new.profile_change_reason)),0) not between 1 and 500 then raise exception 'changeReasonRequired'; end if;
   new.profile_audit:=old.profile_audit||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'by',auth.uid(),'reason',trim(new.profile_change_reason),'changes',changes));
 end if;
 -- A reason must be provided for each edit, never inherited from a prior update.
 new.profile_change_reason:='';
 return new;
end; $$;
create trigger customer_profile before insert or update on public.customers for each row execute function public.protect_customer_profile();
revoke all on function public.protect_customer_profile() from public,anon;

create or replace function public.validate_amendment() returns trigger language plpgsql security invoker set search_path='' as $$
declare original public.records; latest_id text; k text; event_kind text:=coalesce(new.payload->>'kind','correction');
begin
 if not public.shop_access(new.shop_id,true) then raise exception 'noAccess'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.shop_id::text||new.record_id::text,0));
 select * into original from public.records where id=new.record_id and shop_id=new.shop_id;
 select id::text into latest_id from public.amendments where shop_id=new.shop_id and record_id=new.record_id order by created_at desc,id desc limit 1;
 if (new.payload->>'previousAmendmentId') is distinct from latest_id then raise exception 'conflict: record changed'; end if;
 if exists(select 1 from public.amendments where shop_id=new.shop_id and record_id=new.record_id and payload->>'kind'='void') then raise exception 'recordVoided'; end if;
 if original.id is null or event_kind not in ('correction','void','photo')
 or new.payload - array['id','recordId','reason','snapshot','createdAt','createdBy','syncState','kind','previousAmendmentId','photoChange'] <> '{}'::jsonb
 or (new.payload->>'id') is distinct from new.id::text or (new.payload->>'recordId') is distinct from new.record_id::text
 or (new.payload->>'createdBy') is distinct from new.created_by::text or new.created_by is distinct from auth.uid()
 or coalesce(length(trim(new.payload->>'reason')),0) not between 1 and 500
 or not public.check_record_snapshot(new.payload->'snapshot',new.shop_id,original.created_by)
 then raise exception 'Invalid amendment'; end if;
 foreach k in array array['id','reference','shopId','createdBy','customerId','occurredAt','currency','templateVersion'] loop
   if (new.payload->'snapshot'->k) is distinct from (original.snapshot->k) then raise exception 'Invalid amendment identity'; end if;
 end loop;
 if event_kind<>'correction' and ((new.payload->'snapshot')-'syncState') is distinct from (original.snapshot-'syncState') then raise exception 'Invalid amendment snapshot'; end if;
 if event_kind='photo' then
   if jsonb_typeof(new.payload->'photoChange') is distinct from 'object'
   or coalesce(new.payload->'photoChange'->>'slot','') not in ('person','idFront')
   or coalesce(new.payload->'photoChange'->>'action','') not in ('add','replace','remove','adjust')
   or (new.payload->'photoChange') - array['slot','action'] <> '{}'::jsonb then raise exception 'Invalid photo audit'; end if;
 elsif new.payload ? 'photoChange' then raise exception 'Invalid photo audit'; end if;
 new.created_at:=clock_timestamp();
 new.payload:=jsonb_set(new.payload,'{createdAt}',to_jsonb(new.created_at));
 return new;
end; $$;

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
     insert into public.customers(id,shop_id,person,fingerprint_template,fingerprints,fingerprint_change_reason,profile_change_reason)
     values(target,p_shop,p_payload->'person', nullif(p_payload->>'fingerprintTemplate',''), p_payload->'fingerprints', coalesce(p_payload->>'fingerprintReason',''),coalesce(p_payload->>'profileReason',''))
     on conflict(id) do nothing returning version into v;
   else
     update public.customers
     set person=p_payload->'person',
         fingerprints=case when p_payload ? 'fingerprints' then p_payload->'fingerprints' else fingerprints end,
         fingerprint_change_reason=coalesce(p_payload->>'fingerprintReason',''),
         profile_change_reason=coalesce(p_payload->>'profileReason',''),
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
