import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { Repository } from "../src/data/repository";
import { memoryVault } from "../src/data/memory-vault";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Membership,
  type Draft,
  type Customer,
} from "../src/domain/models";
const owner = randomUUID(),
  staff = randomUUID(),
  outsider = randomUUID(),
  shop = randomUUID(),
  otherShop = randomUUID();
const membership: Membership = {
  userId: owner,
  shopId: shop,
  role: "owner",
  version: 1,
  profile: {
    ...emptyShop(),
    name: "Owner",
    shopName: "Test shop",
    address: "Kabul",
  },
};
const draft = (): Draft => ({
  id: randomUUID(),
  customerId: "",
  customer: { ...emptyPerson(), name: "Test", idNumber: "1234-1234-12345" },
  phone: { ...emptyPhone(), model: "Phone", imei1: "490154203237518" },
  direction: "buy",
  customerConfirmed: true,
  price: "100",
  createdAt: new Date().toISOString(),
  step: 2,
});

test("profile editing preserves historical snapshots, checks staff identity permissions and detects stale screens", async () => {
  const repo = new Repository(memoryVault(), membership, randomUUID);
  const record = await repo.finalize(draft());
  const initial = (await repo.customers())[0];
  await repo.saveCustomer(
    initial.id,
    { ...initial.person, phone: "+93700123456" },
    "New number",
    initial.version,
    initial.person,
  );
  const updated = (await repo.customers())[0];
  assert.equal((await repo.records())[0].customer.phone, "");
  assert.equal(updated.profileAudit?.[0].changes.phone?.after, "+93700123456");
  await assert.rejects(
    repo.saveCustomer(
      initial.id,
      initial.person,
      "Stale",
      initial.version,
      initial.person,
    ),
    /conflict/,
  );
  repo.membership = { ...membership, userId: staff, role: "staff" };
  await assert.rejects(
    repo.saveCustomer(
      initial.id,
      { ...updated.person, name: "Different" },
      "Corrected",
      updated.version,
      updated.person,
    ),
    /identityOwnerOnly/,
  );
  await assert.rejects(repo.amend(record, "Void", null, "void"));
  repo.membership = membership;
  await repo.amend({ ...record, price: "200" }, "Wrong amount", null);
  const correction = (await repo.amendments())[0];
  await assert.rejects(repo.amend(record, "Stale", null, "void"), /conflict/);
  await repo.amend(record, "Cancelled sale", correction.id, "void");
  const voidEvent = (await repo.amendments()).find((a) => a.kind === "void")!;
  await assert.rejects(
    repo.amend(record, "Again", voidEvent.id),
    /recordVoided/,
  );
  assert.equal((await repo.records())[0].price, "100");
});

test("database enforces audited profile changes, owner-only corrections/voids, immutable audit and tenant isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const name of [
      "20261001072643_mobile_records",
      "20261003120000_fingerprint_templates",
      "20261003120001_fingerprint_profiles",
      "20261003111750_hosted_access_hardening",
      "20261003130510_cloud_record_storage",
      "20261004112532_audited_record_customer_edits",
    ])
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(
      `insert into auth.users values('${owner}'),('${staff}'),('${outsider}'); insert into account_status values('${owner}',false),('${staff}',false),('${outsider}',false);insert into shops(id,profile) values('${shop}','{}'),('${otherShop}','{}');insert into memberships values('${shop}','${owner}','owner',true),('${shop}','${staff}','staff',true),('${otherShop}','${outsider}','owner',true);set role authenticated;set request.jwt.claim.sub='${owner}';`,
    );
    const repo = new Repository(memoryVault(), membership, randomUUID);
    const record = await repo.finalize(draft());
    for (const op of await repo.operations())
      await db.query("select apply_operation($1,$2,$3,$4,$5)", [
        shop,
        op.id,
        op.kind,
        JSON.stringify(op.payload),
        op.baseVersion,
      ]);
    const person = record.customer;
    const edit = (
      p: object,
      reason: string,
      version: number,
      id = randomUUID(),
    ) =>
      db.query("select apply_operation($1,$2,'customer',$3,$4)", [
        shop,
        id,
        JSON.stringify({
          id: record.customerId,
          person: p,
          profileReason: reason,
        }),
        version,
      ]);
    await db.exec(`set request.jwt.claim.sub='${staff}'`);
    await assert.rejects(
      edit({ ...person, name: "Changed" }, "Correction", 1),
      /identityOwnerOnly/,
    );
    await assert.rejects(
      edit({ ...person, phone: "123" }, "", 1),
      /changeReasonRequired/,
    );
    await edit({ ...person, phone: "123" }, "Contact updated", 1);
    await assert.rejects(
      edit({ ...person, phone: "456" }, "Stale edit", 1),
      /conflict/,
    );
    await assert.rejects(
      db.query(
        "update customers set person=jsonb_set(person,'{name}','\"Attacker\"'),profile_change_reason='Bypass',version=version+1 where id=$1",
        [record.customerId],
      ),
      /identityOwnerOnly/,
    );
    await db.query(
      "update customers set profile_audit='[]',version=version+1 where id=$1",
      [record.customerId],
    );
    assert.equal(
      (
        await db.query<{ profile_audit: unknown[] }>(
          "select profile_audit from customers",
        )
      ).rows[0].profile_audit.length,
      1,
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    await edit(
      { ...person, name: "Correct name", phone: "123" },
      "Owner checked ID",
      3,
    );
    const audit = (
      await db.query<{ profile_audit: { by: string; changes: object }[] }>(
        "select profile_audit from customers",
      )
    ).rows[0].profile_audit;
    assert.equal(audit.length, 2);
    assert.equal(audit[0].by, staff);
    assert.equal(audit[1].by, owner);
    const event = (kind: string, prev: string | null, id = randomUUID()) => ({
      id,
      recordId: record.id,
      createdBy: owner,
      createdAt: new Date().toISOString(),
      reason: "Checked",
      snapshot: record,
      kind,
      previousAmendmentId: prev,
    });
    const push = (p: object, id = randomUUID()) =>
      db.query("select apply_operation($1,$2,'amendment',$3,0)", [
        shop,
        id,
        JSON.stringify(p),
      ]);
    const correction = event("correction", null);
    await db.exec(`set request.jwt.claim.sub='${staff}'`);
    await assert.rejects(
      push({ ...correction, createdBy: staff }),
      /noAccess|row-level security/,
    );
    await db.exec(`set request.jwt.claim.sub='${owner}'`);
    await push(correction);
    await assert.rejects(push(event("void", null)), /conflict/);
    await assert.rejects(
      push({
        ...event("photo", correction.id),
        photoChange: {
          slot: "person",
          action: "replace",
          uri: "file:///private/photo.jpg",
        },
      }),
      /Invalid photo audit/,
    );
    const photo = {
      ...event("photo", correction.id),
      photoChange: { slot: "idFront", action: "adjust" },
    };
    await push(photo);
    const voided = event("void", photo.id),
      opid = randomUUID();
    await push(voided, opid);
    await push(voided, opid);
    await assert.rejects(push(event("correction", voided.id)), /recordVoided/);
    await assert.rejects(
      db.query("delete from records where id=$1", [record.id]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update amendments set payload='{}'"),
      /permission denied/,
    );
    const original = (
      await db.query<{ snapshot: typeof record }>(
        "select snapshot from records",
      )
    ).rows[0].snapshot;
    assert.equal(original.customer.name, person.name);
    assert.equal(original.price, record.price);
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal((await db.query("select * from amendments")).rows.length, 0);
    assert.equal((await db.query("select * from customers")).rows.length, 0);
    await assert.rejects(push(event("void", voided.id)), /noAccess/);
  } finally {
    await db.close();
  }
});
