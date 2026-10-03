alter table public.customers add column if not exists fingerprint_template text;

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
     insert into public.customers(id,shop_id,person,fingerprint_template)
     values(target,p_shop,p_payload->'person', nullif(p_payload->>'fingerprintTemplate',''))
     on conflict(id) do nothing returning version into v;
   else
     update public.customers
     set person=p_payload->'person',
         fingerprint_template=coalesce(nullif(p_payload->>'fingerprintTemplate',''), fingerprint_template),
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
