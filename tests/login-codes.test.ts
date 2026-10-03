import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  generateLoginCode,
  hashLoginCode,
  normalizeLoginPhone,
  normalizeLoginCode,
} from "../supabase/functions/_shared/login-code-core";

test("login codes normalize local digits and bind the code hash to both phone and server secret", async () => {
  assert.equal(normalizeLoginPhone("۰۷۰۰۱۲۳۴۵۶"), "+93700123456");
  assert.equal(normalizeLoginCode("۱۲۳۴ ۵۶۷۸"), "12345678");
  assert.throws(() => normalizeLoginCode("123456"));
  assert.throws(() => normalizeLoginPhone("no-phone"));
  const first = await hashLoginCode(
    "+12025550123",
    "12345678",
    "server-secret-a",
  );
  assert.equal(first.length, 64);
  assert.notEqual(
    first,
    await hashLoginCode("+12025550124", "12345678", "server-secret-a"),
  );
  assert.notEqual(
    first,
    await hashLoginCode("+12025550123", "12345678", "server-secret-b"),
  );
  const generated = new Set(
    Array.from({ length: 100 }, () => generateLoginCode()),
  );
  assert.equal(generated.size, 100);
  for (const code of generated) assert.match(code, /^\d{8}$/);
});

test("login code storage rejects replay, expired codes, attempts, old generations and unauthorized access", async () => {
  const db = new PGlite();
  const user = "10000000-0000-4000-8000-000000000001";
  const shop = "20000000-0000-4000-8000-000000000001";
  const phone = "+12025550123",
    hash = "a".repeat(64),
    wrong = "b".repeat(64);
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create schema private; grant usage on schema private to service_role;`,
    );
    for (const file of [
      "20261001072643_mobile_records.sql",
      "20261003111750_hosted_access_hardening.sql",
      "20261003113354_admin_login_codes.sql",
    ])
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `insert into auth.users values('${user}'); insert into public.account_status values('${user}',true); insert into public.shops(id,profile) values('${shop}','{}'); insert into public.memberships values('${shop}','${user}','owner',true);`,
    );
    // Hosted service_role bypasses RLS; emulate only that property in the fixture.
    await db.exec("alter role service_role bypassrls; set role service_role;");
    const issue = async (h = hash) =>
      db.query("select public.issue_login_code($1,$2,$3,null)", [
        user,
        phone,
        h,
      ]);
    const consume = async (h = hash, p = phone) =>
      (
        await db.query<{ id: string | null }>(
          "select public.consume_login_code($1,$2) as id",
          [p, h],
        )
      ).rows[0].id;
    await issue();
    assert.equal(
      (
        await db.query<{ id: string | null }>(
          "select public.consume_login_code($1,null) as id",
          [phone],
        )
      ).rows[0].id,
      null,
    );
    assert.equal(await consume(hash, "+12025550124"), null);
    assert.equal(await consume(wrong), null);
    assert.equal(await consume(), user);
    assert.equal(await consume(), null);
    await issue();
    await issue(wrong);
    assert.equal(await consume(), null);
    assert.equal(await consume(wrong), user);
    await issue();
    for (let i = 0; i < 5; i++) assert.equal(await consume(wrong), null);
    assert.equal(await consume(), null);
    await issue();
    assert.equal(await consume(), user);
    await issue();
    await db.exec(
      "update private.login_codes set expires_at=now()-interval '1 second'",
    );
    assert.equal(await consume(), null);
    await issue();
    const raced = await Promise.all([consume(), consume()]);
    assert.equal(raced.filter((id) => id === user).length, 1);
    await issue();
    await db.exec(
      `update public.memberships set active=false where user_id='${user}'`,
    );
    assert.equal(await consume(), null);
    await assert.rejects(issue(), /noAccess/);
    await db.exec("reset role; set role authenticated;");
    await assert.rejects(consume(), /permission denied/);
    await assert.rejects(issue(), /permission denied/);
    await assert.rejects(
      db.query("select * from private.login_codes"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into private.platform_administrators values ($1,true)", [
        user,
      ]),
      /permission denied/,
    );
    await db.exec("reset role; set role anon;");
    await assert.rejects(consume(), /permission denied/);
    await db.exec("reset role;");
    const audit = await db.query<{ action: string }>(
      "select action from private.login_code_audit",
    );
    assert.ok(audit.rows.some((a) => a.action === "locked"));
    assert.ok(audit.rows.some((a) => a.action === "redeemed"));
    assert.equal(JSON.stringify(audit.rows).includes(hash), false);
  } finally {
    await db.close();
  }
});
