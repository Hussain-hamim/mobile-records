-- Bounded, shop-scoped read APIs. Invoker functions retain table RLS.
create index if not exists records_shop_page on public.records(shop_id, (snapshot->>'occurredAt') desc, id desc);
create index if not exists customers_shop_page on public.customers(shop_id,id);
create index if not exists records_customer_page on public.records(shop_id, (snapshot->>'customerId'), (snapshot->>'occurredAt') desc,id desc);
create index if not exists amendments_record_page on public.amendments(shop_id,record_id,created_at desc,id desc);
create index if not exists records_shop_imei1 on public.records(shop_id,(snapshot#>>'{phone,imei1}'));
create index if not exists records_shop_imei2 on public.records(shop_id,(snapshot#>>'{phone,imei2}'));

create function public.shop_search_normalize(value text) returns text language sql immutable parallel safe set search_path='' as $$
 select lower(translate(coalesce(value,''),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789'))
$$;

create function public.shop_records_page(p_shop uuid,p_query text default '',p_direction text default null,p_day date default null,p_customer uuid default null,p_imei text default null,p_cursor jsonb default null,p_limit integer default 25)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; needle text; take integer := least(greatest(coalesce(p_limit,25),1),50);
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 needle := '%' || replace(replace(replace(public.shop_search_normalize(trim(coalesce(p_query,''))), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
 with page as materialized (
  select r.id,r.snapshot,r.snapshot->>'occurredAt' as stamp
  from public.records r where r.shop_id=p_shop
   and (p_direction is null or r.snapshot->>'direction'=p_direction)
   and (p_customer is null or r.snapshot->>'customerId'=p_customer::text)
   and (p_imei is null or r.snapshot#>>'{phone,imei1}'=p_imei or r.snapshot#>>'{phone,imei2}'=p_imei)
   and (p_day is null or ((r.snapshot->>'occurredAt')::timestamptz at time zone 'Asia/Kabul')::date=p_day)
   and (p_cursor is null or (r.snapshot->>'occurredAt',r.id) < (p_cursor->>'stamp',(p_cursor->>'id')::uuid))
   and (coalesce(p_query,'')='' or public.shop_search_normalize(concat_ws(' ',r.snapshot->>'reference',r.snapshot#>>'{customer,name}',r.snapshot#>>'{customer,phone}',r.snapshot#>>'{customer,idNumber}',replace(r.snapshot#>>'{customer,idNumber}','-',''),r.snapshot#>>'{phone,imei1}',r.snapshot#>>'{phone,imei2}',r.snapshot#>>'{phone,brand}',r.snapshot#>>'{phone,model}')) like needle)
  order by r.snapshot->>'occurredAt' desc,r.id desc limit take+1
 ), shown as (select * from page order by stamp desc,id desc limit take)
 select jsonb_build_object('items',coalesce((select jsonb_agg(s.snapshot || jsonb_build_object('syncState','synced','listVoided',exists(select 1 from public.amendments a where a.shop_id=p_shop and a.record_id=s.id and a.payload->>'kind'='void')) order by s.stamp desc,s.id desc) from shown s),'[]'::jsonb),
 'next',case when (select count(*) from page)>take then (select jsonb_build_object('stamp',stamp,'id',id) from shown order by stamp,id limit 1) else null end) into result;
 return result;
end $$;

create function public.shop_customers_page(p_shop uuid,p_query text default '',p_cursor uuid default null,p_limit integer default 25,p_fingerprints boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; needle text; take integer := least(greatest(coalesce(p_limit,25),1),case when p_fingerprints then 100 else 50 end);
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 needle := '%' || replace(replace(replace(public.shop_search_normalize(trim(coalesce(p_query,''))), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
 with page as materialized (
 select c.* from public.customers c where c.shop_id=p_shop and (p_cursor is null or c.id>p_cursor)
 and (not p_fingerprints or jsonb_array_length(coalesce(c.fingerprints,'[]'::jsonb))>0 or nullif(c.fingerprint_template,'') is not null)
 and (coalesce(p_query,'')='' or public.shop_search_normalize(concat_ws(' ',c.person->>'name',c.person->>'phone',c.person->>'idNumber',replace(c.person->>'idNumber','-',''))) like needle)
 order by c.id limit take+1
 ), shown as (select * from page order by id limit take)
 select jsonb_build_object('items',coalesce((select jsonb_agg(case when p_fingerprints then jsonb_build_object('id',id,'fingerprints',fingerprints,'fingerprint_template',fingerprint_template) else jsonb_build_object('id',id,'person',person,'version',version) end order by id) from shown),'[]'::jsonb),
 'next',case when (select count(*) from page)>take then (select to_jsonb(id) from shown order by id desc limit 1) else null end) into result;
 return result;
end $$;

create function public.shop_period_metrics(p_shop uuid,p_starts jsonb,p_until timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; earliest timestamptz;
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 if jsonb_typeof(p_starts)<>'object' or (select count(*) from jsonb_object_keys(p_starts))>3 then raise exception 'invalid periods'; end if;
 select min(value::timestamptz) into earliest from jsonb_each_text(p_starts);
 with effective as materialized (
 select coalesce(a.payload->'snapshot',r.snapshot) as s from public.records r
 left join lateral (select a.payload from public.amendments a where a.shop_id=p_shop and a.record_id=r.id and coalesce(a.payload->>'kind','correction')='correction' order by a.payload->>'createdAt' desc,a.id desc limit 1) a on true
 where r.shop_id=p_shop and (r.snapshot->>'occurredAt')::timestamptz>=earliest and (r.snapshot->>'occurredAt')::timestamptz<=p_until
 and not exists(select 1 from public.amendments v where v.shop_id=p_shop and v.record_id=r.id and v.payload->>'kind'='void')
 ), periods as (select key,value::timestamptz as start from jsonb_each_text(p_starts))
 select jsonb_object_agg(key,metrics) into result from (
 select p.key,jsonb_build_object('start',p.start,'count',count(e.s),'purchases',count(e.s) filter(where e.s->>'direction'='buy'),'sales',count(e.s) filter(where e.s->>'direction'='sell'),
 'purchaseTotal',coalesce(sum(public.shop_search_normalize(e.s->>'price')::numeric) filter(where e.s->>'direction'='buy'),0),
 'saleTotal',coalesce(sum(public.shop_search_normalize(e.s->>'price')::numeric) filter(where e.s->>'direction'='sell'),0)) as metrics
 from periods p left join effective e on (e.s->>'occurredAt')::timestamptz>=p.start group by p.key,p.start
 ) totals;
 return coalesce(result,'{}'::jsonb);
end $$;

revoke all on function public.shop_records_page(uuid,text,text,date,uuid,text,jsonb,integer),public.shop_customers_page(uuid,text,uuid,integer,boolean),public.shop_period_metrics(uuid,jsonb,timestamptz),public.shop_search_normalize(text) from public,anon;
grant execute on function public.shop_records_page(uuid,text,text,date,uuid,text,jsonb,integer),public.shop_customers_page(uuid,text,uuid,integer,boolean),public.shop_period_metrics(uuid,jsonb,timestamptz),public.shop_search_normalize(text) to authenticated;
