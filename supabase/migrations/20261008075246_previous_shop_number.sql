-- Include the current business shop number in the existing restricted lookup.
create or replace function public.previous_shop_lookup(p_actor uuid,p_shop uuid,p_imeis text[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare enabled boolean; found jsonb; outcome text; n integer;
begin
 if not exists(select 1 from public.memberships m join public.account_status a on a.user_id=m.user_id
   where m.user_id=p_actor and m.shop_id=p_shop and m.active and not a.must_change_password)
 then
   if p_imeis is not null then
     insert into private.previous_shop_lookup_audit(actor_id,shop_id,outcome)
     values((select user_id from public.account_status where user_id=p_actor),(select id from public.shops where id=p_shop),'denied');
   end if;
   return jsonb_build_object('error','noAccess');
 end if;
 -- Status reads have the same membership gate and return no data from other shops.
 select f.enabled into enabled from private.previous_shop_feature f where singleton;
 if p_imeis is null then return jsonb_build_object('enabled',coalesce(enabled,false)); end if;
 perform pg_advisory_xact_lock(hashtextextended('previous-shop:'||p_actor::text,0));
 -- Re-read after waiting for concurrent requests, so a disabled switch cannot be stale.
 select f.enabled into enabled from private.previous_shop_feature f where singleton;
 select count(*) into n from private.previous_shop_lookup_audit a where a.actor_id=p_actor and a.at>clock_timestamp()-interval '1 minute' and a.outcome<>'rate_limited';
 if n>=30 then outcome:='rate_limited';
 elsif not coalesce(enabled,false) then outcome:='disabled';
 elsif cardinality(p_imeis) not between 1 and 2 or exists(select 1 from unnest(p_imeis) v where v is null or v !~ '^[0-9]{15}$') then outcome:='invalid';
 else
   select coalesce(jsonb_agg(jsonb_build_object('imeis',q.imeis,'shopName',coalesce(s.profile->>'shopName',''),
     'shopNumber',coalesce(s.profile->>'shopNumber',''),'phone',coalesce(s.profile->>'phone',''),'address',coalesce(s.profile->>'address',''),
     'occurredAt',q.occurred_at,'direction',q.direction) order by q.occurred_at desc,q.record_id desc),'[]'::jsonb) into found
   from (
     select chosen.record_id,chosen.shop_id,chosen.occurred_at,chosen.direction,array_agg(chosen.imei order by chosen.imei) as imeis
     from (
       select distinct on (i.imei) i.* from private.previous_shop_imeis i
       where i.imei=any(p_imeis) and i.shop_id<>p_shop
       order by i.imei,i.occurred_at desc,i.recorded_at desc,i.record_id desc
     ) chosen group by chosen.record_id,chosen.shop_id,chosen.occurred_at,chosen.direction
   ) q join public.shops s on s.id=q.shop_id;
   outcome:=case when jsonb_array_length(found)>0 then 'matched' else 'not_found' end;
 end if;
 insert into private.previous_shop_lookup_audit(actor_id,shop_id,outcome) values(p_actor,p_shop,outcome);
 if outcome='rate_limited' then return jsonb_build_object('error','previousShopRateLimited'); end if;
 if outcome='disabled' then return jsonb_build_object('enabled',false,'matches','[]'::jsonb); end if;
 if outcome='invalid' then return jsonb_build_object('error','invalidImei'); end if;
 return jsonb_build_object('enabled',true,'matches',found);
end; $$;
