import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Draft,
} from "../src/domain/models";
import {
  formatTazkiraNumber,
  validTazkiraNumber,
  matchesTazkiraNumber,
  validateDraft,
} from "../src/domain/validation";
import { Repository } from "../src/data/repository";
import { memoryVault } from "../src/data/memory-vault";
const draft = (): Draft => ({
  id: randomUUID(),
  direction: "buy",
  phone: { ...emptyPhone(), model: "Test", imei1: "490154203237518" },
  customer: { ...emptyPerson(), name: "Test", idNumber: "1234-1234-12345" },
  customerId: "",
  customerConfirmed: true,
  price: "100",
  createdAt: new Date().toISOString(),
  step: 1,
});
test("ENID defaults and formats Western, Pashto and Arabic digits into 4-4-5 groups", () => {
  assert.equal(emptyPerson().idType, "enid");
  assert.equal(formatTazkiraNumber("۱۲۳۴١٢٣٤۱۲۳۴۵", "enid"), "1234-1234-12345");
  for (const [raw, formatted] of [
    ["", ""],
    ["1234", "1234"],
    ["12345", "1234-5"],
    ["12345678", "1234-5678"],
    ["1234-", "1234"],
  ])
    assert.equal(formatTazkiraNumber(raw, "enid"), formatted);
  assert.equal(validTazkiraNumber("1234123412345", "enid"), true);
  assert.equal(validTazkiraNumber("1234-1234-12345", "enid"), true);
  assert.equal(validTazkiraNumber("1234-1234-1234", "enid"), false);
});
test("PNID has no fixed length or separators, and switching types never truncates digits", () => {
  for (const number of ["1", "0000123", "12345678901234567890"]) {
    assert.equal(formatTazkiraNumber(number, "pnid"), number);
    assert.equal(validTazkiraNumber(number, "pnid"), true);
    assert.equal(
      formatTazkiraNumber(formatTazkiraNumber(number, "enid"), "pnid"),
      number,
    );
  }
  assert.equal(formatTazkiraNumber("۱۲۳۴-۵۶۷۸", "pnid"), "12345678");
  assert.equal(validTazkiraNumber("abc", "pnid"), false);
  assert.equal(validTazkiraNumber("12345678901234", "enid"), false);
});
test("validation enforces selected type while retaining compatibility with untyped historical data", () => {
  const d = draft();
  d.customer.idNumber = "123";
  assert.ok(validateDraft(d).includes("invalidEnid"));
  d.customer.idType = "pnid";
  assert.deepEqual(validateDraft(d), []);
  delete d.customer.idType;
  d.customer.idNumber = "OLD-123";
  assert.deepEqual(validateDraft(d), []);
  assert.equal(matchesTazkiraNumber("1234-1234-12345", "۱۲۳۴۱۲۳۴۱۲۳۴۵"), true);
  assert.equal(matchesTazkiraNumber("1234-1234-12345", "1234-1234"), true);
  assert.equal(matchesTazkiraNumber("1234-1234-12345", "999"), false);
});
test("type persists in drafts, customer operations and records without changing earlier forms", async () => {
  const repo = new Repository(
    memoryVault(),
    {
      shopId: randomUUID(),
      userId: randomUUID(),
      role: "owner",
      version: 1,
      profile: {
        ...emptyShop(),
        name: "Owner",
        shopName: "Test shop",
        address: "Kabul",
      },
    },
    randomUUID,
  );
  const first = draft();
  await repo.saveDraft(first);
  assert.equal((await repo.drafts())[0].customer.idType, "enid");
  const saved = await repo.finalize(first);
  const second = {
    ...draft(),
    customerId: saved.customerId,
    customer: {
      ...first.customer,
      idType: "pnid" as const,
      idNumber: "000123",
    },
  };
  await repo.saveDraft(second);
  await repo.finalize(second);
  // Transaction snapshots can differ, but profiles now require an explicit audited edit.
  const profile = (await repo.customers())[0];
  assert.equal(profile.person.idType, "enid");
  await repo.saveCustomer(profile.id, second.customer, "Owner checked paper Tazkira", profile.version, profile.person);
  const reopened = new Repository(repo.vault, repo.membership, randomUUID);
  assert.equal((await reopened.customers())[0].person.idType, "pnid");
  assert.equal(
    (await reopened.records()).find((r) => r.id === saved.id)!.customer.idType,
    "enid",
  );
  const operation = (await reopened.operations()).find(
    (o) => o.kind === "customer",
  )!;
  assert.equal(
    (operation.payload as { person: { idType: string } }).person.idType,
    "pnid",
  );
});
