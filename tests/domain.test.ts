import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Repository, synchronize } from "../src/data/repository";
import { memoryVault } from "../src/data/vault.web";
import {
    emptyPerson,
    emptyPhone,
    emptyShop,
    type Draft,
    type Membership,
} from "../src/domain/models";
import { formHtml } from "../src/domain/print-template";
import {
    digits,
    extractImeis,
    latestRecordForCustomer,
    normalizePhone,
    parties,
    validateDraft,
    validImei,
} from "../src/domain/validation";
const member = (): Membership => ({
  shopId: randomUUID(),
  userId: randomUUID(),
  role: "owner",
  version: 1,
  profile: {
    ...emptyShop(),
    shopName: "Shop A",
    name: "Owner",
    address: "Kabul",
  },
});
const draft = (): Draft => ({
  id: randomUUID(),
  direction: "buy",
  phone: { ...emptyPhone(), model: "Test", imei1: "490154203237518" },
  customer: { ...emptyPerson(), name: "Customer", idNumber: "1234-1234-12345" },
  customerId: "",
  customerConfirmed: true,
  fingerprintTemplate: "dGVzdC10ZW1wbGF0ZQ==",
  price: "100",
  createdAt: new Date().toISOString(),
  step: 2,
});
test("IMEI normalization, full length, candidate extraction and international phones", () => {
  assert.equal(digits("۱۲۳٤٥٦"), "123456");
  assert.ok(validImei("۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸"));
  assert.ok(validImei("490154203237519"));
  assert.ok(validImei("000000000000000"));
  assert.ok(!validImei("49015420323751"));
  assert.deepEqual(
    extractImeis("IMEI: 490154203237518\nSN: 123\n490154203237518"),
    ["490154203237518"],
  );
  assert.equal(normalizePhone("۰۷۰۰۱۲۳۴۵۶"), "+93700123456");
  assert.throws(() => normalizePhone("123"));
  const d = draft();
  d.phone.imei2 = d.phone.imei1;
  assert.ok(validateDraft(d).includes("invalidSecondImei"));
  d.price = "1e5";
  assert.ok(validateDraft(d).includes("invalidPrice"));
});
test("finalization is idempotent, atomic in the vault, and snapshots do not follow profile edits", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  const d = draft();
  await repo.saveDraft(d);
  const a = await repo.finalize(d);
  const b = await repo.finalize(d);
  assert.equal(a.id, b.id);
  assert.equal((await repo.records()).length, 1);
  assert.equal((await repo.drafts()).length, 0);
  await repo.saveProfile({ ...repo.membership.profile, name: "Changed" });
  assert.equal((await repo.records())[0].shop.name, "Owner");
  assert.equal(parties(a).seller.name, "Customer");
  assert.equal(parties({ ...a, direction: "sell" }).seller.name, "Owner");
});
test("sync retries preserve pending data and acknowledge idempotent operations once", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  await repo.finalize(draft());
  const seen = new Set<string>();
  let offline = true;
  const transport = {
    async checkAccess() {},
    async push(op: { id: string }) {
      if (offline) throw new Error("offline");
      seen.add(op.id);
      return { version: 1 };
    },
    async pull() {
      return {
        records: [],
        customers: [],
        amendments: [],
        profile: repo.membership.profile,
        version: 1,
      };
    },
  };
  await synchronize(repo, transport);
  assert.equal((await repo.operations()).length, 2);
  assert.ok((await repo.operations()).every((o) => o.state === "failed"));
  offline = false;
  await synchronize(repo, transport);
  await synchronize(repo, transport);
  assert.equal(seen.size, 2);
  assert.equal((await repo.operations()).length, 0);
  assert.equal((await repo.records())[0].syncState, "synced");
});
test("access revoked before sync prevents upload and preserves the outbox", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  await repo.finalize(draft());
  let pushes = 0;
  await assert.rejects(() =>
    synchronize(repo, {
      async checkAccess() {
        throw new Error("noAccess");
      },
      async push() {
        pushes++;
        return { version: 1 };
      },
      async pull() {
        throw new Error("unreachable");
      },
    }),
  );
  assert.equal(pushes, 0);
  assert.equal((await repo.operations()).length, 2);
});

test("edits made during upload survive acknowledgment and get a fresh operation key", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  await repo.saveProfile({ ...repo.membership.profile, name: "First" });
  const initial = (await repo.operations())[0];
  await synchronize(repo, {
    async checkAccess() {},
    async push() {
      await repo.saveProfile({
        ...repo.membership.profile,
        name: "Edited during upload",
      });
      return { version: 2 };
    },
    async pull() {
      return {
        records: [],
        customers: [],
        amendments: [],
        profile: { ...repo.membership.profile, name: "First" },
        version: 2,
      };
    },
  });
  const queued = await repo.operations();
  assert.equal(queued.length, 1);
  assert.notEqual(queued[0].id, initial.id);
  assert.equal(queued[0].baseVersion, 2);
  assert.equal(repo.membership.profile.name, "Edited during upload");
});

test("simultaneous finalization taps create only one immutable record", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  const d = draft();
  const [a, b] = await Promise.all([repo.finalize(d), repo.finalize(d)]);
  assert.equal(a.id, b.id);
  assert.equal((await repo.records()).length, 1);
  assert.equal((await repo.operations()).length, 2);
});
test("conflicts retain local edits; PDF escapes user text and marks unverified template", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  await repo.saveProfile({ ...repo.membership.profile, name: "Local" });
  await synchronize(repo, {
    async checkAccess() {},
    async push() {
      throw new Error("conflict");
    },
    async pull() {
      return {
        records: [],
        customers: [],
        amendments: [],
        profile: { ...repo.membership.profile, name: "Remote" },
        version: 2,
      };
    },
  });
  assert.equal(repo.membership.profile.name, "Local");
  assert.equal((await repo.operations())[0].state, "conflict");
  const record = await repo.finalize(draft());
  record.customer.name = "<script>danger</script>";
  const html = formHtml(record, "en", "");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("DRAFT FORM"));
  assert.ok(html.includes("draft-v1"));
});

test("printed records normalize existing digits without modifying saved records", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  const record = await repo.finalize(draft());
  record.customer.idNumber = "۱۲۳-٤٥";
  record.shop.shopNumber = "۲۴";
  record.phone.model = "iPhone ۱۳";
  record.price = "۲۴۵۰۰";
  const original = structuredClone(record);
  for (const language of ["en", "ps", "fa"] as const) {
    const html = formHtml(record, language, "", false, "اصلاح ۲");
    assert.doesNotMatch(html, /[۰-۹٠-٩]/);
    assert.ok(html.includes("123-45"));
    assert.ok(html.includes("iPhone 13"));
    assert.ok(html.includes("24500 AFN"));
  }
  assert.deepEqual(record, original);
});
test("fingerprint templates stay on the customer and the newest record opens", async () => {
  const repo = new Repository(memoryVault(), member(), randomUUID);
  const saved = await repo.finalize(draft());
  assert.equal(JSON.stringify(saved).includes("dGVzdC10ZW1wbGF0ZQ"), false);
  const customer = (await repo.customers())[0];
  assert.equal(customer.fingerprints?.[0].template, "dGVzdC10ZW1wbGF0ZQ==");
  const op = (await repo.operations()).find((item) => item.kind === "customer");
  assert.equal(
    (op?.payload as { fingerprints: { template: string }[] }).fingerprints[0]
      .template,
    customer.fingerprints?.[0].template,
  );
  const older = {
    ...saved,
    id: "older",
    occurredAt: "2020-01-01T00:00:00.000Z",
  };
  const newer = {
    ...saved,
    id: "newer",
    occurredAt: "2024-01-01T00:00:00.000Z",
  };
  assert.equal(
    latestRecordForCustomer([older, newer], saved.customerId)?.id,
    "newer",
  );
  assert.equal(latestRecordForCustomer([older], "missing"), undefined);
});
