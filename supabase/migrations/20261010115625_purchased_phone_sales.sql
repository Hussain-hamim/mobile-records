-- Effective device histories contain only phone metadata, never customer/biometric data.
-- Invoker rights + explicit membership checks preserve table RLS for all entry points.
create function public.shop_phone_histories(p_shop uuid)
returns table(item jsonb) language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 return query
 with recursive effective as materialized (
   select r.id, coalesce(a.payload->'snapshot',r.snapshot) as s
   from public.records r
   left join lateral (
     select a.payload from public.amendments a where a.shop_id=p_shop and a.record_id=r.id
       and coalesce(a.payload->>'kind','correction')='correction'
     order by a.payload->>'createdAt' desc,a.id desc limit 1
   ) a on true
   where r.shop_id=p_shop and not exists(select 1 from public.amendments v
     where v.shop_id=p_shop and v.record_id=r.id and v.payload->>'kind'='void')
 ), phones as materialized (
   select id,s,array(select distinct regexp_replace(public.shop_search_normalize(v),'[[:space:]-]','','g')
     from unnest(array[s#>>'{phone,imei1}',s#>>'{phone,imei2}']) v where coalesce(v,'')<>'') as imeis
   from effective
 ), edges as materialized (
   select distinct x as a,y as b from phones, unnest(imeis) x,unnest(imeis) y
 ), reach(a,b) as (
   select a,b from edges
   union
   select r.a,e.b from reach r join edges e on e.a=r.b
 ), roots as (select a,min(b) as root from reach group by a),
 grouped as materialized (
   select p.*,r.root from phones p join roots r on r.a=p.imeis[1]
 ), devices as (
   select distinct root from grouped
 )
 select jsonb_build_object(
   'id',coalesce(p.id,l.id),'purchase',case when p.id is null then null else
     jsonb_build_object('id',p.id,'reference',p.s->>'reference','occurredAt',p.s->>'occurredAt','direction',p.s->>'direction','phone',p.s->'phone') end,
   'latest',jsonb_build_object('id',l.id,'reference',l.s->>'reference','occurredAt',l.s->>'occurredAt','direction',l.s->>'direction','phone',l.s->'phone'),
   'imeis',(select jsonb_agg(a order by a) from roots where root=d.root),
   'purchaseIds',coalesce((select jsonb_agg(id order by s->>'occurredAt' desc,id desc) from grouped where root=d.root and s->>'direction'='buy'),'[]'::jsonb),
   'references',coalesce((select jsonb_agg(s->>'reference' order by s->>'occurredAt' desc,id desc) from grouped where root=d.root and s->>'direction'='buy'),'[]'::jsonb)
 ) from devices d
 cross join lateral(select * from grouped where root=d.root order by s->>'occurredAt' desc,id desc limit 1) l
 left join lateral(select * from grouped where root=d.root and s->>'direction'='buy' order by s->>'occurredAt' desc,id desc limit 1) p on true;
end $$;

create function public.shop_purchased_phones(p_shop uuid,p_query text default '',p_include_sold boolean default false,p_imeis text[] default null,p_purchase uuid default null,p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; needle text;
begin
 if not public.shop_access(p_shop) then raise exception 'noAccess'; end if;
 if cardinality(p_imeis)>2 then raise exception 'invalidImei'; end if;
 needle := '%' || replace(replace(replace(public.shop_search_normalize(trim(coalesce(p_query,''))), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
 with candidates as materialized (
 select item,coalesce(item#>>'{purchase,occurredAt}',item#>>'{latest,occurredAt}') as stamp,item->>'id' as id
 from public.shop_phone_histories(p_shop)
 where case
   when p_imeis is not null then exists(select 1 from unnest(p_imeis) v where item->'imeis' ? regexp_replace(public.shop_search_normalize(v),'[[:space:]-]','','g'))
   when p_purchase is not null then item->'purchaseIds' ? p_purchase::text
   else item->'purchase'<>'null'::jsonb and (p_include_sold or item#>>'{latest,direction}'='buy')
     and public.shop_search_normalize(concat_ws(' ',item#>>'{purchase,phone,brand}',item#>>'{purchase,phone,model}',item->'imeis',item->'references')) like needle
   end
 ), page as (
 select * from candidates where p_cursor is null or (stamp,id)<(p_cursor->>'stamp',p_cursor->>'id') order by stamp desc,id desc limit 26
 ), shown as (select * from page order by stamp desc,id desc limit 25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by stamp desc,id desc) from shown),'[]'::jsonb),
 'next',case when (select count(*) from page)>25 then (select jsonb_build_object('stamp',stamp,'id',id) from shown order by stamp,id limit 1) else null end) into result;
 return result;
end $$;

-- Additive provenance validation: old clients/records without a source remain valid.
create function public.validate_purchase_source() returns trigger
language plpgsql security invoker set search_path='' as $$
declare source jsonb; source_id text;
begin
 if tg_table_name='amendments' then
   select snapshot->>'sourcePurchaseId' into source_id from public.records where id=new.record_id and shop_id=new.shop_id;
   if (new.payload#>>'{snapshot,sourcePurchaseId}') is distinct from source_id then raise exception 'purchaseUnavailable'; end if;
   return new;
 end if;
 source_id := new.snapshot->>'sourcePurchaseId';
 if source_id is null then return new; end if;
 if new.snapshot->>'direction'<>'sell' or source_id=new.id::text then raise exception 'purchaseUnavailable'; end if;
 select coalesce(a.payload->'snapshot',r.snapshot) into source from public.records r
 left join lateral(select payload from public.amendments a where a.shop_id=new.shop_id and a.record_id=r.id and coalesce(a.payload->>'kind','correction')='correction' order by a.payload->>'createdAt' desc,a.id desc limit 1) a on true
 where r.id::text=source_id and r.shop_id=new.shop_id
 and not exists(select 1 from public.amendments v where v.shop_id=new.shop_id and v.record_id=r.id and v.payload->>'kind'='void');
 if source is null or source->>'direction'<>'buy' or not exists(
   select 1 from unnest(array[source#>>'{phone,imei1}',source#>>'{phone,imei2}']) a,
   unnest(array[new.snapshot#>>'{phone,imei1}',new.snapshot#>>'{phone,imei2}']) b
   where nullif(a,'') is not null and a=b
 ) then raise exception 'purchaseUnavailable'; end if;
 return new;
end $$;
create trigger records_purchase_source before insert on public.records for each row execute function public.validate_purchase_source();
create trigger amendments_purchase_source before insert on public.amendments for each row execute function public.validate_purchase_source();
revoke all on function public.shop_phone_histories(uuid),public.shop_purchased_phones(uuid,text,boolean,text[],uuid,jsonb),public.validate_purchase_source() from public,anon;
grant execute on function public.shop_phone_histories(uuid),public.shop_purchased_phones(uuid,text,boolean,text[],uuid,jsonb) to authenticated;
