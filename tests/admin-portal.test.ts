import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('admin management is server-only, validates changes, protects platform admins and audits access',async()=>{
 const db=new PGlite();const owner='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002',shop='20000000-0000-4000-8000-000000000001';
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create schema private; grant usage on schema private to service_role;`);
 for(const file of ['20261001072643_mobile_records.sql','20261003111750_hosted_access_hardening.sql','20261003113354_admin_login_codes.sql','20261003114346_admin_portal_management.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into auth.users values('${owner}'),('${admin}'); insert into public.account_status values('${owner}',false); insert into public.shops(id,profile) values('${shop}','{}'); insert into public.memberships values('${shop}','${owner}','owner',true); insert into private.platform_administrators values('${admin}',true); set role authenticated;set request.jwt.claim.sub='${owner}';`);
 await assert.rejects(db.query('select public.admin_overview()'),/permission denied/);
 await assert.rejects(db.query('select public.admin_set_access($1,$2,false,$3,null)',[shop,owner,'Test']),/permission denied/);
 await assert.rejects(db.query('select public.is_platform_administrator($1)',[owner]),/permission denied/);
 await db.exec('reset role;set role service_role;');
 const summary=async()=>(await db.query<{data:{shops:number;accounts:number;activeAccounts:number}}> ('select public.admin_overview() as data')).rows[0].data;
 assert.equal((await summary()).shops,1);assert.equal((await summary()).activeAccounts,1);
 await assert.rejects(db.query('select public.admin_set_access($1,$2,false,$3,$4)',[shop,owner,'',admin]),/reason/);
 await db.query('select public.admin_set_access($1,$2,false,$3,$4)',[shop,owner,'Suspended for test',admin]);
 assert.equal((await summary()).activeAccounts,0);
 await db.query('select public.admin_set_access($1,$2,true,$3,$4)',[shop,owner,'Restored after test',admin]);
 assert.equal((await summary()).activeAccounts,1);
 await assert.rejects(db.query('select public.admin_set_access($1,$2,false,$3,$4)',[shop,admin,'Disallowed',admin]),/managed separately/);
 await assert.rejects(db.query('select public.admin_set_access($1,$2,true,$3,$4)',['20000000-0000-4000-8000-000000000099',owner,'Missing membership',admin]),/not found/);
 await db.exec('reset role;');
 const audit=await db.query<{action:string;actor_id:string;reason:string}>('select action,actor_id,reason from private.admin_activity order by id');
 assert.deepEqual(audit.rows.map(r=>r.action),['access_disabled','access_enabled']);assert.ok(audit.rows.every(r=>r.actor_id===admin&&r.reason));
 }finally{await db.close()}
});
