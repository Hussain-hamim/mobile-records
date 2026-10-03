import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
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
      readFileSync(
        new URL(
          "../supabase/migrations/20261003120000_fingerprint_templates.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261003120001_fingerprint_profiles.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    // Simulate the broad default grants on a hosted Supabase project.
    await db.exec('create role service_role; grant all on all tables in schema public to anon, authenticated;');
    await db.exec(readFileSync(new URL('../supabase/migrations/20261003111750_hosted_access_hardening.sql', import.meta.url), 'utf8'));
    for (const table of ['account_status', 'shops', 'memberships', 'customers', 'records', 'amendments', 'applied_operations']) {
      assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('anon', $1, 'SELECT') as allowed", [table])).rows[0].allowed, false);
      assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('authenticated', $1, 'TRUNCATE') as allowed", [table])).rows[0].allowed, false);
    }
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
    const cid = "40000000-0000-4000-8000-000000000001";
    await db.query("select apply_operation($1,$2,$3,$4,$5)", [
      s1,
      "cust-1",
      "customer",
      JSON.stringify({
        id: cid,
        person: { name: "A" },
        fingerprintTemplate: "abc",
      }),
      0,
    ]);
    const stored = await db.query<{ fingerprint_template: string }>(
      "select fingerprint_template from customers where id=$1",
      [cid],
    );
    assert.equal(stored.rows[0].fingerprint_template, "abc");
    await db.query("select apply_operation($1,$2,$3,$4,$5)", [
      s1,
      "cust-2",
      "customer",
      JSON.stringify({ id: cid, person: { name: "B" } }),
      1,
    ]);
    const kept = await db.query<{
      name: string;
      fingerprint_template: string;
    }>(
      "select person->>'name' as name, fingerprint_template from customers where id=$1",
      [cid],
    );
    assert.equal(kept.rows[0].name, "B");
    assert.equal(kept.rows[0].fingerprint_template, "abc");
    assert.equal(
      JSON.stringify(
        (await db.query("select snapshot from records")).rows[0],
      ).includes("fingerprintTemplate"),
      false,
    );
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
    const original = (
      await db.query<{ fingerprints: unknown[] }>(
        "select fingerprints from customers where id=$1",
        [cid],
      )
    ).rows[0].fingerprints;
    const backup = {
      id: "backup-1",
      slot: "backup",
      template: "backup-template",
      enrolledAt: new Date().toISOString(),
      enrolledBy: u3,
    };
    await db.query("select apply_operation($1,$2,'customer',$3,2)", [
      s1,
      "add-backup",
      JSON.stringify({
        id: cid,
        person: { name: "B" },
        fingerprints: [...original, backup],
      }),
    ]);
    await assert.rejects(
      db.query(
        "update customers set fingerprints='[]',version=version+1 where id=$1",
        [cid],
      ),
      /fingerprintOwnerOnly/,
    );
    await assert.rejects(
      db.query("select apply_operation($1,$2,'customer',$3,3)", [
        s1,
        "remove-staff",
        JSON.stringify({
          id: cid,
          person: { name: "B" },
          fingerprints: [],
          fingerprintReason: "test",
        }),
      ]),
      /fingerprintOwnerOnly/,
    );
    await db.exec(`set request.jwt.claim.sub='${u1}'`);
    await assert.rejects(
      db.query(
        "update customers set fingerprints='[]',version=version+1 where id=$1",
        [cid],
      ),
      /fingerprintReasonRequired/,
    );
    await db.query("select apply_operation($1,$2,'customer',$3,3)", [
      s1,
      "remove-owner",
      JSON.stringify({
        id: cid,
        person: { name: "B" },
        fingerprints: [],
        fingerprintReason: "Customer request",
      }),
    ]);
    await db.query("select apply_operation($1,$2,'customer',$3,4)", [
      s1,
      "legacy-replay",
      JSON.stringify({
        id: cid,
        person: { name: "B" },
        fingerprintTemplate: "abc",
      }),
    ]);
    const removed = (
      await db.query<{
        fingerprints: unknown[];
        fingerprint_audit: unknown[];
        fingerprint_template: string | null;
      }>(
        "select fingerprints,fingerprint_audit,fingerprint_template from customers where id=$1",
        [cid],
      )
    ).rows[0];
    assert.deepEqual(removed.fingerprints, []);
    assert.equal(removed.fingerprint_template, null);
    assert.equal(removed.fingerprint_audit.length, 4);
    assert.equal(
      JSON.stringify(removed.fingerprint_audit).includes("backup-template"),
      false,
    );
    await db.exec(`set request.jwt.claim.sub='${u2}'`);
    assert.equal(
      (await db.query("select fingerprints from customers")).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${u3}'`);
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
