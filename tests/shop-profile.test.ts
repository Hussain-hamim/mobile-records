import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Repository } from "../src/data/repository";
import { memoryVault } from "../src/data/vault.web";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Draft,
} from "../src/domain/models";
import {
  isShopProfileComplete,
  missingShopFields,
} from "../src/domain/shop-profile";

test("profile readiness rejects missing and whitespace-only details but leaves other fields optional", () => {
  assert.equal(isShopProfileComplete(undefined), false);
  assert.deepEqual(
    missingShopFields({ shopName: "Test", name: "  ", address: "\n" }),
    ["name", "address"],
  );
  assert.equal(
    isShopProfileComplete({
      ...emptyShop(),
      shopName: "Test",
      name: "Owner",
      address: "Kabul",
    }),
    true,
  );
});

test("an incomplete shop cannot finalize a record; saved profile enables the same draft", async () => {
  const vault = memoryVault();
  const repo = new Repository(
    vault,
    {
      shopId: randomUUID(),
      userId: randomUUID(),
      role: "owner",
      version: 1,
      profile: {
        ...emptyShop(),
        shopName: "Test",
        name: "Owner",
        address: " ",
      },
    },
    randomUUID,
  );
  const draft: Draft = {
    id: randomUUID(),
    direction: "buy",
    phone: { ...emptyPhone(), model: "Phone", imei1: "490154203237518" },
    customer: {
      ...emptyPerson(),
      name: "Customer",
      idNumber: "1234-1234-12345",
    },
    customerId: "",
    customerConfirmed: true,
    price: "100",
    createdAt: new Date().toISOString(),
    step: 1,
  };
  await assert.rejects(repo.finalize(draft), /shopRequired/);
  assert.equal((await repo.records()).length, 0);
  assert.equal((await repo.customers()).length, 0);
  await repo.saveProfile({ ...repo.membership.profile, address: "Kabul" });
  const record = await repo.finalize(draft);
  assert.equal(record.shop.address, "Kabul");
  assert.equal(record.phone.imei1, draft.phone.imei1);
  assert.equal((await repo.records()).length, 1);
});
