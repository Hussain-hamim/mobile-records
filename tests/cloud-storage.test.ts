import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cloudVault } from "../src/data/cloud-vault";
import { memoryVault } from "../src/data/memory-vault";
import { Repository } from "../src/data/repository";
import { normalizeImei, validImei } from "../src/domain/validation";
import { emptyPerson, emptyPhone, emptyShop, type Draft, type Membership, type Operation } from "../src/domain/models";

const owner = randomUUID(), staff = randomUUID(), outsider = randomUUID();
const shop = randomUUID(), otherShop = randomUUID();
const membership: Membership = { userId: owner, shopId: shop, role: "owner", version: 1,
  profile: { ...emptyShop(), name: "Test owner", shopName: "Test shop", address: "Kabul" } };
const draft = (direction: "buy" | "sell" = "buy"): Draft => ({
  id: randomUUID(), direction, phone: { ...emptyPhone(), model: "Test phone", imei1: "490154203237518" },
  customer: { ...emptyPerson(), name: "Test customer", idNumber: "1234-1234-12345" }, customerId: "", customerConfirmed: true,
  price: "100", createdAt: new Date().toISOString(), step: 2,
});

const imeiMigration = readFileSync(new URL("../supabase/migrations/20261006082626_align_record_imei_validation.sql", import.meta.url), "utf8");

async function setup(includeImeiMigration = true) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const file of ["20261001072643_mobile_records", "20261003120000_fingerprint_templates", "20261003120001_fingerprint_profiles", "20261003111750_hosted_access_hardening", "20261003130510_cloud_record_storage", "20261004112532_audited_record_customer_edits"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}.sql`, import.meta.url), "utf8"));
  if (includeImeiMigration) await db.exec(imeiMigration);
  await db.exec(`insert into auth.users values('${owner}'),('${staff}'),('${outsider}');
    insert into account_status values('${owner}',false),('${staff}',false),('${outsider}',false);
    insert into shops(id,profile) values('${shop}','{}'),('${otherShop}','{}');
    insert into memberships values('${shop}','${owner}','owner',true),('${shop}','${staff}','staff',true),('${otherShop}','${outsider}','owner',true);
    set role authenticated; set request.jwt.claim.sub='${owner}';`);
  return db;
}

test("cloud saves commit purchase/sale atomically, replay once, and suppress late draft autosaves", async () => {
  const db = await setup();
  const save = (ops: Operation[], drafts: { id: string; value: unknown }[]) => db.query("select save_cloud_changes($1,$2,$3)", [shop, JSON.stringify(ops), JSON.stringify(drafts)]);
  try {
    for (const direction of ["buy", "sell"] as const) {
      const d = draft(direction);
      await save([], [{ id: d.id, value: d }]);
      const repo = new Repository(memoryVault(), membership, randomUUID);
      await repo.finalize(d);
      const ops = await repo.operations();
      await save(ops, [{ id: d.id, value: null }]);
      await save(ops, [{ id: d.id, value: null }]);
      await save([], [{ id: d.id, value: d }]);
      assert.equal((await db.query("select * from records where id=$1", [d.id])).rows.length, 1);
      assert.equal((await db.query("select * from transaction_drafts where id=$1", [d.id])).rows.length, 0);
    }
    assert.equal((await db.query("select * from customers")).rows.length, 2);
    const d = draft();
    await save([], [{ id: d.id, value: d }]);
    const repo = new Repository(memoryVault(), membership, randomUUID);
    await repo.finalize(d);
    const ops = await repo.operations();
    (ops.find((op) => op.kind === "record")!.payload as { price: string }).price = "-1";
    await assert.rejects(save(ops, [{ id: d.id, value: null }]));
    assert.equal((await db.query("select * from customers")).rows.length, 2, "failed record rolls back customer write");
    assert.equal((await db.query("select * from transaction_drafts where id=$1", [d.id])).rows.length, 1, "failed record keeps draft");
    assert.equal((await db.query("select * from applied_operations")).rows.length, 4, "failed operations leave no replay markers");
  } finally { await db.close(); }
});

test("cloud drafts enforce own-staff scope, shop isolation, valid identity, and membership revocation", async () => {
  const db = await setup();
  const d = draft();
  const save = (id = shop, value: unknown = d) => db.query("select save_cloud_changes($1,'[]',$2)", [id, JSON.stringify([{ id: d.id, value }])]);
  try {
    await save();
    await assert.rejects(save(otherShop), /noAccess/);
    await assert.rejects(save(shop, {}), /check constraint/);
    await db.exec(`set request.jwt.claim.sub='${staff}'`);
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 0);
    await assert.rejects(db.query("insert into transaction_drafts(shop_id,user_id,id,payload) values($1,$2,$3,$4)", [shop, owner, randomUUID(), JSON.stringify(d)]));
    await save();
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 1);
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 0);
    await assert.rejects(save(), /noAccess/);
    await db.exec(`reset role; update memberships set active=false where user_id='${staff}'; set role authenticated; set request.jwt.claim.sub='${staff}'`);
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 0);
    await assert.rejects(save(), /noAccess/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select * from transaction_drafts"), /permission denied/);
    await assert.rejects(save(), /permission denied/);
  } finally { await db.close(); }
});

test("cloud adapter waits for server acknowledgement, surfaces failures and keeps no local outbox", async () => {
  let finish!: (value: { error: null | { message: string } }) => void;
  const calls: unknown[] = [];
  const api = { rpc: (name: string, args: unknown) => {
    calls.push({ name, args });
    return new Promise<{ error: null | { message: string } }>((resolve) => { finish = resolve; });
  } } as unknown as SupabaseClient;
  const vault = cloudVault(api, membership);
  const d = draft();
  let saved = false;
  const write = vault.batch([{ key: "draft:" + d.id, value: d }]).then(() => { saved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved, false);
  finish({ error: { message: "Network request failed" } });
  await assert.rejects(write, /Network request failed/);
  assert.equal(saved, false);
  const retry = vault.batch([{ key: "draft:" + d.id, value: d }]);
  await new Promise((resolve) => setImmediate(resolve));
  finish({ error: null });
  await retry;
  assert.deepEqual(calls[0], { name: "save_cloud_changes", args: { p_shop: shop, p_operations: [], p_drafts: [{ id: d.id, value: d }] } });
  assert.deepEqual(await vault.list("op:"), []);
  await vault.close();
  await assert.rejects(vault.list("draft:"), /closed/);
});

test("active application storage does not open the legacy SQLite vault", () => {
  const source = readFileSync(new URL("../src/state/app-context.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bopenVault\b|from ["']\.\.\/data\/vault["']/);
  assert.match(source, /isDemo \? memoryVault\(\) : cloudVault/);
});

test("a fresh cloud session reloads records, drafts and both fingerprint slots from shop-scoped rows", async () => {
  const d = draft();
  const customerId = randomUUID();
  const fingerprints = (["primary", "backup"] as const).map((slot) => ({ id: randomUUID(), slot, template: `synthetic-${slot}`, enrolledAt: d.createdAt, enrolledBy: owner }));
  const filters: { table: string; column: string; value: unknown }[] = [];
  const rows: Record<string, unknown[]> = {
    records: [{ id: d.id, snapshot: { id: d.id, direction: "buy", syncState: "pending" } }],
    customers: [{ id: customerId, person: d.customer, version: 3, fingerprints, fingerprint_audit: [], fingerprint_template: null }],
    transaction_drafts: [{ id: d.id, payload: d }],
  };
  const api = { from: (table: string) => {
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters.push({ table, column, value }); return query; },
      order() { return query; },
      range() { return query; },
      then(resolve: (result: unknown) => void) { resolve({ data: rows[table], error: null }); },
    };
    return query;
  } } as unknown as SupabaseClient;
  const first = cloudVault(api, membership);
  await first.close();
  const repo = new Repository(cloudVault(api, membership), membership, randomUUID);
  assert.equal((await repo.records())[0].syncState, "synced");
  assert.deepEqual((await repo.customers())[0].fingerprints, fingerprints);
  assert.deepEqual(await repo.drafts(), [d]);
  for (const table of Object.keys(rows))
    assert.ok(filters.some((f) => f.table === table && f.column === "shop_id" && f.value === shop));
  assert.ok(filters.some((f) => f.table === "transaction_drafts" && f.column === "user_id" && f.value === owner));
  await repo.vault.close();
});

test("IMEI migration repairs rejected drafts without dropping snapshot validation", async () => {
  const db = await setup(false);
  const save = (ops: Operation[], d: Draft) => db.query("select save_cloud_changes($1,$2,$3)", [shop, JSON.stringify(ops), JSON.stringify([{ id: d.id, value: null }])]);
  try {
    const d = draft();
    d.phone.imei1 = "490154203237519"; // 15 digits accepted by the app, different checksum.
    const repo = new Repository(memoryVault(), membership, randomUUID);
    await repo.finalize(d);
    const ops = await repo.operations();
    await db.query("select save_cloud_changes($1,'[]',$2)", [shop, JSON.stringify([{ id: d.id, value: d }])]);
    await assert.rejects(save(ops, d), /valid_snapshot/);
    assert.equal((await db.query("select * from records")).rows.length, 0);
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 1);
    await db.exec("reset role");
    await db.exec(imeiMigration);
    await db.exec("set role authenticated");
    await save(ops, d);
    await save(ops, d);
    assert.equal((await db.query("select * from records")).rows.length, 1);
    assert.equal((await db.query("select * from transaction_drafts")).rows.length, 0);

    for (const direction of ["buy", "sell"] as const) {
      const next = draft(direction);
      next.phone.imei1 = "۴۹۰۱۵۴۲۰۳۲۳۷۵۱۹";
      next.phone.imei2 = "000000000000000";
      const nextRepo = new Repository(memoryVault(), membership, randomUUID);
      await nextRepo.finalize(next);
      const nextOps = await nextRepo.operations();
      await save(nextOps, next);
      const row = (await db.query<{ snapshot: { phone: { imei1: string; imei2: string } } }>("select snapshot from records where id=$1", [next.id])).rows[0];
      assert.equal(row.snapshot.phone.imei1, "490154203237519");
      assert.equal(row.snapshot.phone.imei2, "000000000000000");
    }
  } finally { await db.close(); }
});

test("database IMEI policy matches normalized app inputs and retains other snapshot guards", async () => {
  const db = await setup();
  try {
    for (const input of ["490154203237518", "490154203237519", "000000000000000", "۴۹۰۱۵۴۲۰۳۲۳۷۵۱۹", "490 154 203 237 519", "", "49015420323751", "4901542032375190", "49015420323751x"]) {
      const row = (await db.query<{ valid: boolean }>("select validate_imei($1) as valid", [normalizeImei(input)])).rows[0];
      assert.equal(row.valid, validImei(input), input);
    }
    assert.equal((await db.query<{ valid: boolean }>("select validate_imei(null) as valid")).rows[0].valid, false);
    const d = draft();
    d.phone.imei1 = "490154203237519";
    const repo = new Repository(memoryVault(), membership, randomUUID);
    const record = await repo.finalize(d);
    for (const invalid of [
      { ...record, phone: { ...record.phone, imei1: "123" } },
      { ...record, phone: { ...record.phone, imei2: record.phone.imei1 } },
      { ...record, phone: { ...record.phone, imei2: "letters" } },
      { ...record, phone: { ...record.phone, model: "" } },
      { ...record, customer: { ...record.customer, name: "" } },
      { ...record, customer: { ...record.customer, idNumber: "" } },
      { ...record, price: "0" },
      { ...record, currency: "USD" },
      { ...record, direction: "invalid" },
      { ...record, shopId: otherShop },
      { ...record, createdBy: outsider },
      { ...record, id: randomUUID() },
    ]) {
      await assert.rejects(db.query("insert into records(id,shop_id,created_by,snapshot) values($1,$2,$3,$4)", [record.id, shop, owner, JSON.stringify(invalid)]), /valid_snapshot/);
    }
    assert.equal((await db.query("select * from records")).rows.length, 0);
  } finally { await db.close(); }
});
