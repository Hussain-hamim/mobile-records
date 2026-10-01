create table public.account_status (user_id uuid primary key references auth.users(id), must_change_password boolean not null default true);
create table public.shops (id uuid primary key, profile jsonb not null, version integer not null default 1);
create table public.memberships (shop_id uuid references public.shops(id), user_id uuid references auth.users(id), role text not null check(role in ('owner','staff')), active boolean not null default true, primary key(shop_id,user_id));
create table public.customers (id uuid primary key, shop_id uuid not null references public.shops(id), person jsonb not null, version integer not null default 1);
create table public.records (id uuid primary key, shop_id uuid not null references public.shops(id), created_by uuid not null references auth.users(id), snapshot jsonb not null, created_at timestamptz not null default now(), unique(shop_id,id));
create table public.amendments (id uuid primary key, shop_id uuid not null, record_id uuid not null, created_by uuid not null references auth.users(id), payload jsonb not null, created_at timestamptz not null default now(), foreign key(shop_id,record_id) references public.records(shop_id,id));
create table public.applied_operations (shop_id uuid not null references public.shops(id), id text not null, payload_hash text not null, result_version integer not null, primary key(shop_id,id));
create index records_shop_created on public.records(shop_id,created_at desc);
create index customers_shop on public.customers(shop_id);
create index amendments_shop on public.amendments(shop_id);
create index records_imei1 on public.records(shop_id,(snapshot->'phone'->>'imei1'));
create index records_imei2 on public.records(shop_id,(snapshot->'phone'->>'imei2'));

alter table public.account_status enable row level security;
alter table public.shops enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.records enable row level security;
alter table public.amendments enable row level security;
alter table public.applied_operations enable row level security;
create policy account_self on public.account_status for select to authenticated using(user_id=(select auth.uid()));
create policy membership_self on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create function public.shop_access(target uuid, owner_only boolean default false) returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.memberships m join public.account_status a on a.user_id=m.user_id where m.user_id=(select auth.uid()) and m.shop_id=target and m.active and not a.must_change_password and (not owner_only or m.role='owner'));
$$;
create policy shop_read on public.shops for select to authenticated using(public.shop_access(id));
create policy shop_write on public.shops for update to authenticated using(public.shop_access(id,true)) with check(public.shop_access(id,true));
create policy customer_read on public.customers for select to authenticated using(public.shop_access(shop_id));
create policy customer_add on public.customers for insert to authenticated with check(public.shop_access(shop_id));
create policy customer_update on public.customers for update to authenticated using(public.shop_access(shop_id)) with check(public.shop_access(shop_id));
create policy record_read on public.records for select to authenticated using(public.shop_access(shop_id));
create policy record_add on public.records for insert to authenticated with check(public.shop_access(shop_id) and created_by=(select auth.uid()));
create policy amendment_read on public.amendments for select to authenticated using(public.shop_access(shop_id));
create policy amendment_add on public.amendments for insert to authenticated with check(public.shop_access(shop_id,true) and created_by=(select auth.uid()));
create policy operation_read on public.applied_operations for select to authenticated using(public.shop_access(shop_id));
create policy operation_add on public.applied_operations for insert to authenticated with check(public.shop_access(shop_id));
grant select on public.account_status, public.memberships to authenticated;
grant select, update on public.shops to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert on public.records,public.amendments,public.applied_operations to authenticated;

create function public.validate_imei(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare total integer:=0; n integer; i integer;
begin
 if value is null or value !~ '^[0-9]{15}$' or value ~ '^([0-9])\1{14}$' then return false; end if;
 for i in 1..15 loop n:=substring(value,i,1)::integer; if i%2=0 then n:=n*2; end if; total:=total+case when n>9 then n-9 else n end; end loop;
 return total%10=0;
end; $$;
create function public.check_record_snapshot(s jsonb, shop uuid, actor uuid) returns boolean language sql immutable set search_path='' as $$
 select coalesce(s->>'shopId'=shop::text and s->>'createdBy'=actor::text and s->>'direction' in ('buy','sell')
 and s->>'currency'='AFN' and s->>'templateVersion'='draft-v1'
 and length(trim(s->'customer'->>'name'))>0 and length(trim(s->'customer'->>'idNumber'))>0
 and length(trim(s->'phone'->>'model'))>0
 and s->>'price' ~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
 and (s->>'price')::numeric>0
 and public.validate_imei(s->'phone'->>'imei1')
 and (coalesce(s->'phone'->>'imei2','')='' or (public.validate_imei(s->'phone'->>'imei2') and s->'phone'->>'imei1'<>s->'phone'->>'imei2')),false);
$$;
alter table public.records add constraint valid_snapshot check(public.check_record_snapshot(snapshot,shop_id,created_by) and coalesce(snapshot->>'id'=id::text,false));
create function public.protect_record_entities() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.shop_id<>old.shop_id) then raise exception 'Immutable identity'; end if;
 if tg_op='UPDATE' and new.version<>old.version+1 then raise exception 'conflict'; end if;
 return new;
end; $$;
create trigger customer_identity before update on public.customers for each row execute function public.protect_record_entities();
create function public.validate_amendment() returns trigger language plpgsql security invoker set search_path='' as $$
declare original public.records;
begin
 select * into original from public.records where id=new.record_id and shop_id=new.shop_id;
 if original.id is null or (new.payload->>'id') is distinct from new.id::text or (new.payload->>'recordId') is distinct from new.record_id::text or (new.payload->>'createdBy') is distinct from new.created_by::text
 or coalesce(length(trim(new.payload->>'reason')),0)=0
 or not public.check_record_snapshot(new.payload->'snapshot',new.shop_id,original.created_by)
 or (new.payload->'snapshot'->>'id') is distinct from new.record_id::text then raise exception 'Invalid amendment'; end if;
 return new;
end; $$;
create trigger amendment_check before insert on public.amendments for each row execute function public.validate_amendment();

create function public.apply_operation(p_shop uuid,p_id text,p_kind text,p_payload jsonb,p_base_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
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
   if p_base_version=0 then insert into public.customers(id,shop_id,person) values(target,p_shop,p_payload->'person') on conflict(id) do nothing returning version into v;
   else update public.customers set person=p_payload->'person',version=version+1 where id=target and shop_id=p_shop and version=p_base_version returning version into v; end if;
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
revoke all on function public.apply_operation(uuid,text,text,jsonb,integer),public.shop_access(uuid,boolean),public.validate_imei(text),public.check_record_snapshot(jsonb,uuid,uuid),public.protect_record_entities(),public.validate_amendment() from public,anon;
grant execute on function public.apply_operation(uuid,text,text,jsonb,integer),public.shop_access(uuid,boolean),public.validate_imei(text),public.check_record_snapshot(jsonb,uuid,uuid) to authenticated;
