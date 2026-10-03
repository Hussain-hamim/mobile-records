import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  encryptLoginCode,
  decryptLoginCode,
} from "../supabase/functions/_shared/login-code-encryption";

test("recoverable codes use authenticated encryption bound to user and phone with unique nonces", async () => {
  const args = ["12345678", "user-a", "+12025550123", "server-secret"] as const;
  const first = await encryptLoginCode(...args),
    second = await encryptLoginCode(...args);
  assert.notEqual(first, second);
  assert.equal(
    await decryptLoginCode(
      first,
      ...(args.slice(1) as [string, string, string]),
    ),
    args[0],
  );
  assert.ok(!first.includes(args[0]));
  for (const [user, phone, key] of [
    ["user-b", args[2], args[3]],
    [args[1], "+12025550124", args[3]],
    [args[1], args[2], "wrong-secret"],
  ])
    await assert.rejects(decryptLoginCode(first, user, phone, key));
  const tampered = first.slice(0, -1) + (first.endsWith("A") ? "B" : "A");
  await assert.rejects(decryptLoginCode(tampered, args[1], args[2], args[3]));
  await assert.rejects(encryptLoginCode("123", args[1], args[2], args[3]));
});

test("active code retrieval survives re-read and stops after replacement, use, expiry, lockout or revocation", async () => {
  const db = new PGlite();
  const user = "10000000-0000-4000-8000-000000000001",
    phone = "+12025550123",
    hash = "a".repeat(64),
    wrong = "b".repeat(64);
  const sealed = await encryptLoginCode("12345678", user, phone, "test-secret");
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create schema private; grant usage on schema private to service_role; create table public.memberships(user_id uuid,active boolean); create table public.account_status(user_id uuid); grant select on public.memberships,public.account_status to service_role;`,
    );
    for (const name of [
      "20261003113354_admin_login_codes.sql",
      "20261003120044_recoverable_login_codes.sql",
    ])
      await db.exec(
        readFileSync(
          new URL("../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `insert into auth.users values('${user}');insert into public.memberships values('${user}',true);insert into public.account_status values('${user}');set role service_role;`,
    );
    const issue = async (h = hash) =>
      db.query("select public.issue_recoverable_login_code($1,$2,$3,$4,null)", [
        user,
        phone,
        h,
        sealed,
      ]);
    const read = async () =>
      (
        await db.query<{ code: { encryptedCode: string | null } | null }>(
          "select public.read_active_login_code($1) as code",
          [user],
        )
      ).rows[0].code;
    const consume = async (h = hash) =>
      db.query("select public.consume_login_code($1,$2)", [phone, h]);
    await issue();
    assert.equal((await read())?.encryptedCode, sealed);
    assert.equal((await read())?.encryptedCode, sealed);
    await assert.rejects(
      db.query("select public.issue_recoverable_login_code($1,$2,$3,$4,null)", [
        user,
        phone,
        hash,
        "plaintext",
      ]),
      /Invalid encrypted/,
    );
    assert.equal((await read())?.encryptedCode, sealed);
    await consume();
    assert.equal(await read(), null);
    assert.equal(
      (
        await db.query<{ encrypted_code: null }>(
          "select encrypted_code from private.login_codes",
        )
      ).rows[0].encrypted_code,
      null,
    );
    await issue();
    for (let i = 0; i < 5; i++) await consume(wrong);
    assert.equal(await read(), null);
    assert.equal(
      (
        await db.query<{ encrypted_code: null }>(
          "select encrypted_code from private.login_codes",
        )
      ).rows[0].encrypted_code,
      null,
    );
    await issue();
    await db.exec(
      "update private.login_codes set expires_at=now()-interval '1 second'",
    );
    assert.equal(await read(), null);
    await issue();
    await db.exec(
      "reset role;update public.memberships set active=false;set role service_role",
    );
    assert.equal(await read(), null);
    await db.exec(
      "reset role;update public.memberships set active=true;set role service_role",
    );
    await issue();
    await db.query("select public.issue_login_code($1,$2,$3,null)", [
      user,
      phone,
      wrong,
    ]);
    assert.equal((await read())?.encryptedCode, null);
    await issue();
    assert.equal((await read())?.encryptedCode, sealed);
    for (const role of ["authenticated", "anon"]) {
      await db.exec("reset role;set role " + role);
      await assert.rejects(read(), /permission denied/);
      await assert.rejects(issue(), /permission denied/);
      await assert.rejects(
        db.query("select encrypted_code from private.login_codes"),
        /permission denied/,
      );
    }
  } finally {
    await db.close();
  }
});
