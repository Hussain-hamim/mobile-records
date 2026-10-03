import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  fingerprintsOf,
  draftFingerprints,
  scanTemplates,
  validFingerprintSkip,
  fingerprintChanges,
  customerFromRow,
} from "../src/domain/fingerprints";
import { Repository } from "../src/data/repository";
import { memoryVault } from "../src/data/vault.web";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Customer,
  type Draft,
  type FingerprintEntry,
  type Membership,
} from "../src/domain/models";
const member: Membership = {
  userId: "staff-a",
  shopId: "shop-a",
  role: "staff",
  version: 1,
  profile: {
    ...emptyShop(),
    name: "Owner",
    shopName: "Shop",
    address: "Kabul",
  },
};
const entry = (slot: "primary" | "backup" = "primary"): FingerprintEntry => ({
  id: randomUUID(),
  slot,
  template: "dGVzdA==",
  enrolledAt: new Date().toISOString(),
  enrolledBy: member.userId,
});
const customer = (): Customer => ({
  id: "customer-a",
  person: emptyPerson(),
  fingerprints: [entry()],
  version: 1,
});
const draft = (): Draft => ({
  id: randomUUID(),
  customerId: "",
  customer: { ...emptyPerson(), name: "A", idNumber: "123" },
  phone: { ...emptyPhone(), model: "Test", imei1: "490154203237518" },
  direction: "buy",
  customerConfirmed: true,
  price: "10",
  createdAt: new Date().toISOString(),
  step: 2,
});
test("legacy fingerprints have stable IDs and an explicit empty v2 list wins", () => {
  const legacy = {
    ...customer(),
    fingerprints: undefined,
    fingerprintTemplate: "abc",
  };
  assert.deepEqual(fingerprintsOf(legacy), fingerprintsOf(legacy));
  assert.equal(fingerprintsOf(legacy)[0].slot, "primary");
  assert.deepEqual(fingerprintsOf({ ...legacy, fingerprints: [] }), []);
  assert.deepEqual(
    fingerprintsOf(
      customerFromRow({
        id: "a",
        person: {},
        fingerprints: [],
        fingerprint_template: "stale",
        version: 1,
      }),
    ),
    [],
  );
});
test("both finger IDs resolve to one customer; another customer remains distinct", () => {
  const a = customer();
  a.fingerprints!.push(entry("backup"));
  const b = { ...customer(), id: "customer-b" };
  assert.deepEqual(
    scanTemplates([a, b]).map((x) => x.customerId),
    [a.id, a.id, b.id],
  );
  assert.equal(new Set(scanTemplates([a, b]).map((x) => x.id)).size, 3);
});
test("staff adds empty slots but cannot replace or remove, owners need a reason", () => {
  const before = [entry()],
    backup = entry("backup"),
    now = new Date().toISOString();
  assert.equal(
    fingerprintChanges(before, [...before, backup], member, "", now)[0].action,
    "add",
  );
  assert.throws(
    () => fingerprintChanges(before, [], member, "removed", now),
    /OwnerOnly/,
  );
  assert.throws(
    () => fingerprintChanges(before, [entry()], member, "replace", now),
    /OwnerOnly/,
  );
  assert.throws(
    () => fingerprintChanges(before, [], { ...member, role: "owner" }, "", now),
    /ReasonRequired/,
  );
  assert.equal(
    fingerprintChanges(
      before,
      [],
      { ...member, role: "owner" },
      "Customer request",
      now,
    )[0].action,
    "remove",
  );
  assert.throws(
    () => fingerprintChanges([], [entry(), entry()], member, "", now),
    /Invalid/,
  );
});
test("stale drafts cannot restore legacy templates and preserve current saved fingers", () => {
  const d = { ...draft(), fingerprintTemplate: "removed" };
  assert.deepEqual(
    draftFingerprints(d, { ...customer(), fingerprints: [] }),
    [],
  );
  const saved = customer();
  assert.deepEqual(
    draftFingerprints({ ...d, fingerprints: [entry()] }, saved),
    saved.fingerprints,
  );
});
test("optional legacy skip reasons remain audited and later enrollment does not rewrite records", async () => {
  assert.equal(
    validFingerprintSkip({ reason: "otherReason", note: " " }),
    false,
  );
  const repo = new Repository(memoryVault(), member, randomUUID),
    d = draft();
  d.fingerprintSkip = { reason: "customerUnable", note: "Temporary injury" };
  const record = await repo.finalize(d);
  assert.equal(record.fingerprintSkip?.by, member.userId);
  const c = (await repo.customers())[0];
  await repo.saveFingerprints(c.id, [entry()], "", c.version);
  assert.equal((await repo.customers())[0].fingerprints?.length, 1);
  assert.deepEqual((await repo.records())[0], record);
  assert.equal(JSON.stringify(record).includes("dGVzdA"), false);
  await assert.rejects(
    repo.saveFingerprints(c.id, [], "", c.version),
    /OwnerOnly/,
  );
});
test("owner removal reason survives transaction save coalescing the offline customer operation", async () => {
  const repo = new Repository(
    memoryVault(),
    { ...member, role: "owner" },
    randomUUID,
  );
  const d = draft();
  d.fingerprints = [entry()];
  const saved = await repo.finalize(d);
  const c = (await repo.customers())[0];
  await repo.saveFingerprints(c.id, [], "Customer request", c.version);
  await repo.finalize({
    ...draft(),
    customerId: saved.customerId,
    fingerprintSkip: { reason: "customerDeclined", note: "" },
  });
  const op = (await repo.operations()).find((o) => o.kind === "customer")!;
  assert.equal(
    (op.payload as { fingerprintReason: string }).fingerprintReason,
    "Customer request",
  );
  assert.deepEqual((await repo.customers())[0].fingerprints, []);
});

test("purchases and sales save without fingerprints or a skip reason and remain queued after reload", async () => {
  const vault = memoryVault();
  const repo = new Repository(vault, member, randomUUID);
  for (const direction of ["buy", "sell"] as const) {
    const d = { ...draft(), direction };
    const record = await repo.finalize(d);
    assert.equal(record.direction, direction);
    assert.equal(record.fingerprintSkip, undefined);
    assert.equal(record.syncState, "pending");
    assert.equal((await repo.finalize(d)).id, record.id);
  }
  const reopened = new Repository(vault, member, randomUUID);
  assert.equal((await reopened.records()).length, 2);
  assert.ok(
    (await reopened.customers()).every((c) => c.fingerprints?.length === 0),
  );
  assert.equal(
    (await reopened.operations()).filter((op) => op.kind === "record").length,
    2,
  );
});
