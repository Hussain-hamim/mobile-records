import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { emptyPerson, emptyPhone, emptyShop } from "../src/domain/models";
const u1 = "10000000-0000-4000-8000-000000000001",
  u2 = "10000000-0000-4000-8000-000000000002",
  u3 = "10000000-0000-4000-8000-000000000003";
const s1 = "20000000-0000-4000-8000-000000000001",
  s2 = "20000000-0000-4000-8000-000000000002",
  r1 = "30000000-0000-4000-8000-000000000001";
test("Postgres policies enforce tenant isolation, immutable records, password gates and revocation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261001072643_mobile_records.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `insert into auth.users values('${u1}'),('${u2}'),('${u3}');insert into account_status values('${u1}',false),('${u2}',false),('${u3}',false);insert into shops(id,profile) values('${s1}','{}'),('${s2}','{}');insert into memberships values('${s1}','${u1}','owner',true),('${s2}','${u2}','owner',true),('${s1}','${u3}','staff',true);set role authenticated;set request.jwt.claim.sub='${u1}';`,
    );
    assert.equal((await db.query("select * from shops")).rows.length, 1);
    const payload = {
      id: r1,
      shopId: s1,
      createdBy: u1,
      direction: "buy",
      currency: "AFN",
      templateVersion: "draft-v1",
      phone: { ...emptyPhone(), model: "Test", imei1: "490154203237518" },
      customer: { ...emptyPerson(), name: "Test", idNumber: "123" },
      shop: emptyShop(),
      price: "10",
      occurredAt: new Date().toISOString(),
    };
    const push = () =>
      db.query("select apply_operation($1,$2,$3,$4,$5)", [
        s1,
        "operation-1",
        "record",
        JSON.stringify(payload),
        0,
      ]);
    await push();
    await push();
    assert.equal((await db.query("select * from records")).rows.length, 1);
    await assert.rejects(
      db.query("update records set snapshot=$1 where id=$2", ["{}", r1]),
    );
    await assert.rejects(db.query("delete from records where id=$1", [r1]));
    await assert.rejects(
      db.query("select apply_operation($1,$2,$3,$4,$5)", [
        s2,
        "attack",
        "record",
        JSON.stringify({ ...payload, shopId: s2 }),
        0,
      ]),
    );
    await db.exec(`set request.jwt.claim.sub='${u2}'`);
    assert.equal((await db.query("select * from records")).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub='${u3}'`);
    assert.equal((await db.query("select * from records")).rows.length, 1);
    await assert.rejects(
      db.query("select apply_operation($1,$2,$3,$4,$5)", [
        s1,
        "staff-shop-edit",
        "shop",
        JSON.stringify({ id: s1, profile: { name: "Changed" } }),
        1,
      ]),
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${u3}';set role authenticated;`,
    );
    assert.equal((await db.query("select * from records")).rows.length, 0);
    await db.exec(
      `reset role;update account_status set must_change_password=true where user_id='${u1}';set role authenticated;set request.jwt.claim.sub='${u1}';`,
    );
    assert.equal((await db.query("select * from records")).rows.length, 0);
  } finally {
    await db.close();
  }
});
