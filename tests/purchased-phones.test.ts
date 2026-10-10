import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Transaction,
  type Draft,
  type Amendment,
} from "../src/domain/models";
import {
  applyPurchasedPhone,
  purchasedPhoneHistory,
  assertPurchaseSource,
  wouldReplacePhone,
  confirmSaleHistory,
} from "../src/domain/purchased-phones";
import { validImei } from "../src/domain/validation";
import { Repository } from "../src/data/repository";
import { memoryVault } from "../src/data/vault.web";
import { shopQueries } from "../src/data/shop-queries";
const shop = randomUUID(),
  owner = randomUUID(),
  customerId = randomUUID();
const one = "490154203237518",
  two = "356938035643809",
  three = "353918052310400";
const profile = {
  ...emptyShop(),
  name: "Owner",
  shopName: "Test shop",
  address: "Kabul",
};
const person = {
  ...emptyPerson(),
  name: "Synthetic seller",
  idNumber: "1234-1234-12345",
};
function record(
  direction: "buy" | "sell",
  day: number,
  imei1 = one,
  imei2 = two,
): Transaction {
  const id = randomUUID();
  return {
    id,
    reference: "REF-" + id,
    shopId: shop,
    createdBy: owner,
    customerId,
    customer: person,
    shop: profile,
    phone: {
      ...emptyPhone(),
      imei1,
      imei2,
      brand: "Acme",
      model: "Model 100%",
      storage: "128 GB",
      color: "Blue",
      condition: "Used",
      notes: "Seller notes",
    },
    direction,
    price: "100",
    currency: "AFN",
    occurredAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    templateVersion: "draft-v1",
    syncState: "synced",
  };
}
function draft(): Draft {
  return {
    id: randomUUID(),
    direction: "sell",
    phone: emptyPhone(),
    customer: { ...person, name: "New buyer" },
    customerId: "",
    customerConfirmed: true,
    price: "",
    step: 0,
    createdAt: new Date().toISOString(),
  };
}
function amendment(
  r: Transaction,
  kind: "correction" | "void",
  changes: Partial<Transaction> = {},
): Amendment {
  return {
    id: randomUUID(),
    recordId: r.id,
    createdBy: owner,
    createdAt: new Date().toISOString(),
    kind,
    reason: "Synthetic correction",
    snapshot: { ...r, ...changes },
    syncState: "synced",
  };
}

test("prefill copies both IMEIs/specs while preserving buyer, price and current notes; source persists through restart/finalize", async () => {
  const purchase = record("buy", 1);
  const item = purchasedPhoneHistory([purchase], [])[0];
  let d = applyPurchasedPhone(draft(), item);
  assert.equal(d.phone.imei2, two);
  assert.equal(d.phone.color, "Blue");
  assert.equal(d.phone.condition, "");
  assert.equal(d.phone.notes, "");
  assert.equal(d.price, "");
  assert.equal(d.customer.name, "New buyer");
  assert.equal(
    wouldReplacePhone(
      { ...emptyPhone(), model: "Other" },
      item.purchase!.phone,
    ),
    true,
  );
  assert.equal(wouldReplacePhone(emptyPhone(), item.purchase!.phone), false);
  d = applyPurchasedPhone(
    {
      ...d,
      price: "200",
      phone: { ...d.phone, notes: "Current note", condition: "Repaired" },
    },
    item,
  );
  assert.equal(d.price, "200");
  assert.equal(d.phone.condition, "Repaired");
  assert.equal(d.phone.notes, "Current note");
  const vault = memoryVault(),
    membership = {
      shopId: shop,
      userId: owner,
      role: "owner" as const,
      profile,
      version: 1,
    };
  const repo = new Repository(vault, membership, randomUUID);
  await vault.batch([{ key: "record:" + purchase.id, value: purchase }]);
  await repo.saveDraft(d);
  const restarted = new Repository(vault, membership, randomUUID);
  const restored = (await restarted.drafts())[0];
  assert.equal(restored.sourcePurchaseId, purchase.id);
  const saved = await restarted.finalize(restored);
  assert.equal(saved.sourcePurchaseId, purchase.id);
  assert.equal(saved.customer.name, "New buyer");
  assert.equal((await restarted.finalize(restored)).id, saved.id);
  assert.equal(
    (await vault.get<Transaction>("record:" + purchase.id))?.customer.name,
    "Synthetic seller",
  );
});

test("history groups swapped and partial IMEIs, selects latest purchase and respects corrections/voids", () => {
  const a = record("buy", 1),
    b = record("sell", 2, two, one),
    c = record("buy", 3, two, "");
  let items = purchasedPhoneHistory([c, a, b], []);
  assert.equal(items.length, 1);
  assert.equal(items[0].purchase?.id, c.id);
  assert.equal(items[0].latest.direction, "buy");
  items = purchasedPhoneHistory([a, b, c], [amendment(c, "void")]);
  assert.equal(items[0].purchase?.id, a.id);
  assert.equal(items[0].latest.id, b.id);
  items = purchasedPhoneHistory(
    [a, b],
    [
      amendment(b, "correction", {
        phone: { ...b.phone, imei1: three, imei2: "" },
      }),
    ],
  );
  assert.equal(items.length, 2);
  assert.equal(items.find((x) => x.purchase)?.latest.direction, "buy");
  assert.throws(
    () =>
      assertPurchaseSource(
        { ...draft(), phone: a.phone },
        a,
        [amendment(a, "void")],
        shop,
      ),
    /purchaseUnavailable/,
  );
  assert.throws(
    () =>
      assertPurchaseSource({ ...draft(), phone: a.phone }, a, [], randomUUID()),
    /purchaseUnavailable/,
  );
});

test("save confirmation detects a newer sale during the dialog; cancellation/edits/errors do not proceed", async () => {
  const a = record("buy", 1),
    b = record("sell", 2),
    c = record("sell", 3);
  let checks = 0,
    confirms = 0;
  const result = await confirmSaleHistory(
    async () => purchasedPhoneHistory(checks++ === 0 ? [a, b] : [a, b, c], []),
    async () => {
      confirms++;
      return true;
    },
    () => true,
  );
  assert.equal(result, true);
  assert.equal(confirms, 2);
  assert.equal(checks, 3);
  assert.equal(
    await confirmSaleHistory(
      async () => purchasedPhoneHistory([a, b], []),
      async () => false,
      () => true,
    ),
    false,
  );
  let valid = true;
  assert.equal(
    await confirmSaleHistory(
      async () => purchasedPhoneHistory([a, b], []),
      async () => {
        valid = false;
        return true;
      },
      () => valid,
    ),
    false,
  );
  await assert.rejects(
    confirmSaleHistory(
      async () => {
        throw new Error("offline");
      },
      async () => true,
      () => true,
    ),
    /offline/,
  );
});

test("demo queries paginate/deduplicate and resolve old purchase IDs plus either IMEI", async () => {
  const vault = memoryVault(),
    repo = new Repository(
      vault,
      { shopId: shop, userId: owner, role: "owner", profile, version: 1 },
      randomUUID,
    );
  const a = record("buy", 1),
    b = record("sell", 2),
    c = record("buy", 3, two, one);
  await vault.batch(
    [a, b, c].map((r) => ({ key: "record:" + r.id, value: r })),
  );
  const queries = shopQueries(repo, null);
  assert.equal((await queries.purchasedPhones()).items[0].purchase?.id, c.id);
  assert.equal(
    (await queries.purchasedPhones({ purchaseId: a.id })).items[0].purchase?.id,
    c.id,
  );
  assert.equal(
    (await queries.purchasedPhones({ imeis: [two] })).items[0].id,
    c.id,
  );
  assert.equal(
    (await queries.purchasedPhones({ query: "no result" })).items.length,
    0,
  );
});

test("SQL purchase queries use complete effective history, enforce RLS and validate linked sales", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    for (const file of [
      "20261001072643_mobile_records",
      "20261003120000_fingerprint_templates",
      "20261003120001_fingerprint_profiles",
      "20261003111750_hosted_access_hardening",
      "20261003130510_cloud_record_storage",
      "20261004112532_audited_record_customer_edits",
      "20261006082626_align_record_imei_validation",
      "20261008072105_paginated_shop_queries",
      "20261010115625_purchased_phone_sales",
    ])
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
          "utf8",
        ),
      );
    const other = randomUUID(),
      otherShop = randomUUID();
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');insert into account_status values('${owner}',false),('${other}',false);insert into shops(id,profile) values('${shop}','{}'),('${otherShop}','{}');insert into memberships values('${shop}','${owner}','owner',true),('${otherShop}','${other}','owner',true);set request.jwt.claim.sub='${owner}';`,
    );
    await db.query(
      "insert into customers(id,shop_id,person) values($1,$2,$3)",
      [customerId, shop, JSON.stringify(person)],
    );
    async function insert(r: Transaction) {
      await db.query(
        "insert into records(id,shop_id,created_by,snapshot) values($1,$2,$3,$4)",
        [r.id, r.shopId, r.createdBy, JSON.stringify(r)],
      );
    }
    const a = record("buy", 1),
      b = record("sell", 2, two, one);
    await insert(a);
    await insert(b);
    await db.exec("set role authenticated");
    async function page(
      opts: {
        imeis?: string[];
        purchase?: string;
        query?: string;
        includeSold?: boolean;
        cursor?: unknown;
        target?: string;
      } = {},
    ) {
      return (
        await db.query<{
          p: { items: ReturnType<typeof purchasedPhoneHistory>; next: unknown };
        }>("select shop_purchased_phones($1,$2,$3,$4,$5,$6) p", [
          opts.target ?? shop,
          opts.query ?? "",
          opts.includeSold ?? false,
          opts.imeis ?? null,
          opts.purchase ?? null,
          opts.cursor ? JSON.stringify(opts.cursor) : null,
        ])
      ).rows[0].p;
    }
    assert.equal((await page()).items.length, 0);
    let items = (await page({ includeSold: true })).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].latest.id, b.id);
    assert.equal(items[0].purchase?.id, a.id);
    assert.equal("customer" in items[0].purchase!, false);
    assert.equal((await page({ imeis: [two] })).items[0].purchase?.id, a.id);
    assert.equal(
      (await page({ query: "100%", includeSold: true })).items.length,
      1,
    );
    assert.equal(
      (await page({ query: "_", includeSold: true })).items.length,
      0,
    );
    const c = record("buy", 3, two, "");
    await insert(c);
    assert.equal((await page()).items[0].purchase?.id, c.id);
    assert.equal((await page({ purchase: a.id })).items[0].id, c.id);
    // Audited void removes c, showing b as latest again.
    const v = amendment(c, "void");
    await db.query(
      "insert into amendments(id,shop_id,record_id,created_by,payload) values($1,$2,$3,$4,$5)",
      [v.id, shop, c.id, owner, JSON.stringify(v)],
    );
    assert.equal((await page()).items.length, 0);
    assert.equal((await page({ purchase: c.id })).items.length, 0);
    const corrected = amendment(a, "correction", {
      phone: { ...a.phone, model: "Corrected" },
    });
    await db.query(
      "insert into amendments(id,shop_id,record_id,created_by,payload) values($1,$2,$3,$4,$5)",
      [corrected.id, shop, a.id, owner, JSON.stringify(corrected)],
    );
    assert.equal(
      (await page({ imeis: [one] })).items[0].purchase?.phone.model,
      "Corrected",
    );
    const linked = { ...record("sell", 4), sourcePurchaseId: a.id };
    await insert(linked);
    await assert.rejects(
      insert({ ...record("sell", 5), sourcePurchaseId: c.id }),
      /purchaseUnavailable/,
    );
    await assert.rejects(
      insert({ ...record("sell", 5, three, ""), sourcePurchaseId: a.id }),
      /purchaseUnavailable/,
    );
    await assert.rejects(
      insert({ ...record("buy", 5), sourcePurchaseId: a.id }),
      /purchaseUnavailable/,
    );
    await assert.rejects(page({ target: otherShop }), /noAccess/);
    // Cross-shop source exists but is not visible or linkable to this user.
    await db.exec(`reset role;set request.jwt.claim.sub='${other}';`);
    const foreignCustomer = randomUUID();
    await db.query(
      "insert into customers(id,shop_id,person) values($1,$2,$3)",
      [foreignCustomer, otherShop, JSON.stringify(person)],
    );
    const foreign = {
      ...record("buy", 1),
      shopId: otherShop,
      createdBy: other,
      customerId: foreignCustomer,
    };
    await insert(foreign);
    await db.exec(
      `set request.jwt.claim.sub='${owner}';set role authenticated;`,
    );
    assert.equal((await page({ purchase: foreign.id })).items.length, 0);
    await assert.rejects(
      insert({ ...record("sell", 5), sourcePurchaseId: foreign.id }),
      /purchaseUnavailable/,
    );
    // Many unrelated phones must not hide older purchases or produce duplicate pages.
    await db.exec("reset role");
    const template = record("buy", 6);
    await db.query(
      `insert into records(id,shop_id,created_by,snapshot) select id,$1,$2,$3::jsonb || jsonb_build_object('id',id,'reference','BULK-'||n,'phone',($3::jsonb->'phone')||jsonb_build_object('imei1','490154203237518','imei2','')) from (select gen_random_uuid() as id,n from generate_series(1,1001) n) s`,
      [shop, owner, JSON.stringify(template)],
    );
    // Same device repeated 1001 times remains one result, including a late sale beyond any page.
    const last = record("sell", 7, one, "");
    await insert(last);
    await db.exec("set role authenticated");
    assert.equal((await page()).items.length, 0);
    assert.equal((await page({ includeSold: true })).items.length, 1);
    for (let n = 0; n < 31; n++) {
      const prefix = String(10000000000000 + n);
      const imei = Array.from(
        { length: 10 },
        (_, digit) => prefix + digit,
      ).find(validImei)!;
      await insert(record("buy", 8, imei, ""));
    }
    const first = await page(),
      second = await page({ cursor: first.next });
    assert.equal(first.items.length, 25);
    assert.equal(second.items.length, 6);
    assert.equal(second.next, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((x) => x.id)).size,
      31,
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${owner}';set role authenticated;`,
    );
    await assert.rejects(page(), /noAccess/);
    await db.exec("set role anon");
    await assert.rejects(page(), /permission denied/);
  } finally {
    await db.close();
  }
});
