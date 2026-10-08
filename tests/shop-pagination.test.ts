import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyPerson, emptyPhone, emptyShop } from "../src/domain/models";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261008072105_paginated_shop_queries.sql",
    import.meta.url,
  ),
  "utf8",
);

test("server paging bounds thousands of rows, supports search/cursors and preserves tenant access", async () => {
  const db = new PGlite();
  const owner = randomUUID(),
    other = randomUUID(),
    shop = randomUUID(),
    otherShop = randomUUID();
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
    ])
      await db.exec(
        readFileSync(
          new URL(`../supabase/migrations/${file}.sql`, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(migration);
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');insert into account_status values('${owner}',false),('${other}',false);insert into shops(id,profile) values('${shop}','{}'),('${otherShop}','{}');insert into memberships values('${shop}','${owner}','owner',true),('${otherShop}','${other}','owner',true);set request.jwt.claim.sub='${owner}';`,
    );
    const customerId = randomUUID();
    const person = {
      ...emptyPerson(),
      name: "Customer 100% literal",
      idNumber: "1234-1234-12345",
      phone: "+93700123456",
    };
    await db.query(
      "insert into customers(id,shop_id,person) values($1,$2,$3)",
      [customerId, shop, JSON.stringify(person)],
    );
    const snap = {
      id: "",
      reference: "",
      shopId: shop,
      createdBy: owner,
      customerId,
      customer: person,
      shop: {
        ...emptyShop(),
        shopName: "Shop",
        name: "Owner",
        address: "Kabul",
      },
      phone: { ...emptyPhone(), model: "Test", imei1: "490154203237518" },
      direction: "buy",
      currency: "AFN",
      templateVersion: "draft-v1",
      price: "100",
      occurredAt: "2026-10-08T01:00:00.000Z",
    };
    await db.query(
      `insert into records(id,shop_id,created_by,snapshot) select id,$1,$2,$3::jsonb || jsonb_build_object('id',id,'reference','REF-'||n) from (select gen_random_uuid() as id,n from generate_series(1,1251) n) s`,
      [shop, owner, JSON.stringify(snap)],
    );
    await db.exec("set role authenticated");
    const page = async (
      cursor: unknown = null,
      query = "",
      filter: Record<string, unknown> = {},
    ) =>
      (
        await db.query<{ p: { items: { id: string }[]; next: unknown } }>(
          "select shop_records_page($1,$2,$3,$4,$5,$6,$7,$8) p",
          [
            shop,
            query,
            filter.direction ?? null,
            filter.day ?? null,
            filter.customer ?? null,
            filter.imei ?? null,
            cursor ? JSON.stringify(cursor) : null,
            25,
          ],
        )
      ).rows[0].p;
    const first = await page();
    assert.equal(first.items.length, 25);
    assert.ok(first.next);
    const second = await page(first.next);
    assert.equal(second.items.length, 25);
    assert.equal(
      new Set([...first.items, ...second.items].map((x) => x.id)).size,
      50,
    );
    let cursor: unknown = null;
    const ids: string[] = [];
    do {
      const p = await page(cursor);
      ids.push(...p.items.map((x) => x.id));
      cursor = p.next;
    } while (cursor);
    assert.equal(ids.length, 1251);
    assert.equal(new Set(ids).size, 1251);
    assert.equal((await page(null, "no such person")).items.length, 0);
    assert.equal((await page(null, "100%")).items.length, 25);
    assert.equal((await page(null, "_")).items.length, 0);
    assert.equal((await page(null, "۱۲۳۴۱۲۳۴۱۲۳۴۵")).items.length, 25);
    assert.equal((await page(null, "", { direction: "sell" })).items.length, 0);
    assert.equal(
      (
        await page(null, "", {
          day: "2026-10-08",
          customer: customerId,
          imei: "490154203237518",
        })
      ).items.length,
      25,
    );
    const customers = (
      await db.query<{ p: { items: Record<string, unknown>[] } }>(
        "select shop_customers_page($1) p",
        [shop],
      )
    ).rows[0].p;
    assert.equal(customers.items.length, 1);
    assert.equal("fingerprints" in customers.items[0], false);
    assert.equal("profile_audit" in customers.items[0], false);
    const metric = (
      await db.query<{
        p: { today: { count: number; purchaseTotal: number } };
      }>("select shop_period_metrics($1,$2,$3) p", [
        shop,
        JSON.stringify({ today: "2026-10-07T19:30:00Z" }),
        "2026-10-08T12:00:00Z",
      ])
    ).rows[0].p;
    assert.equal(metric.today.count, 1251);
    assert.equal(metric.today.purchaseTotal, 125100);
    // A large customer directory has bounded pages without shipping biometric
    // payloads; scanning explicitly requests a separate, compact template pool.
    await db.exec("reset role");
    await db.query(`insert into customers(id,shop_id,person,fingerprints)
      select gen_random_uuid(),$1,$2::jsonb,jsonb_build_array(
        jsonb_build_object('id','primary-'||n,'slot','primary','template','synthetic-primary','enrolledBy',$3::text,'enrolledAt',now()),
        jsonb_build_object('id','backup-'||n,'slot','backup','template','synthetic-backup','enrolledBy',$3::text,'enrolledAt',now()))
      from generate_series(1,126) n`, [shop, JSON.stringify(person), owner]);
    await db.exec("set role authenticated");
    const customerPage = async (cursor: string | null, fingers = false) =>
      (await db.query<{ p: { items: Record<string, unknown>[]; next: string | null } }>(
        "select shop_customers_page($1,'',$2,$3,$4) p",
        [shop, cursor, fingers ? 100 : 25, fingers],
      )).rows[0].p;
    let customerCursor: string | null = null;
    const customerIds = new Set<string>();
    do {
      const p = await customerPage(customerCursor);
      assert.ok(p.items.length <= 25);
      p.items.forEach(c => {
        assert.equal('fingerprints' in c, false);
        assert.equal('fingerprint_template' in c, false);
        customerIds.add(String(c.id));
      });
      customerCursor = p.next;
    } while (customerCursor);
    assert.equal(customerIds.size, 127);
    const firstFingers = await customerPage(null, true);
    assert.equal(firstFingers.items.length, 100);
    const remainingFingers = await customerPage(firstFingers.next, true);
    assert.equal(remainingFingers.items.length, 26);
    assert.equal(remainingFingers.next, null);
    for (const c of [...firstFingers.items, ...remainingFingers.items]) {
      assert.equal('person' in c, false);
      assert.equal((c.fingerprints as unknown[]).length, 2);
    }
    // A correction contributes only its latest value; voided records contribute
    // neither a count nor an amount. Historical snapshots remain unchanged.
    const amend = async (recordId: string, kind: string, price: string, previous: string | null = null) => {
      const id = randomUUID();
      const { rows } = await db.query<{ snapshot: Record<string, unknown> }>("select snapshot from records where id=$1", [recordId]);
      const payload = { id, recordId, kind, reason: 'Synthetic test', createdBy: owner,
        createdAt: new Date().toISOString(), previousAmendmentId: previous,
        snapshot: { ...rows[0].snapshot, price }, syncState: 'synced' };
      await db.query("insert into amendments(id,shop_id,record_id,created_by,payload) values($1,$2,$3,$4,$5)", [id,shop,recordId,owner,JSON.stringify(payload)]);
      return id;
    };
    const correction = await amend(ids[0], 'correction', '200');
    await amend(ids[0], 'correction', '300', correction);
    await amend(ids[1], 'void', '100');
    const corrected = (await db.query<{ p: { today: { count: number; purchaseTotal: number } } }>(
      "select shop_period_metrics($1,$2,$3) p", [shop,JSON.stringify({today:'2026-10-07T19:30:00Z'}),'2026-10-08T12:00:00Z'],
    )).rows[0].p.today;
    assert.equal(corrected.count, 1250);
    assert.equal(corrected.purchaseTotal, 125200);
    await assert.rejects(
      db.query("select shop_records_page($1)", [otherShop]),
      /noAccess/,
    );
    await assert.rejects(
      db.query("select shop_customers_page($1)", [otherShop]),
      /noAccess/,
    );
    await assert.rejects(
      db.query("select shop_period_metrics($1,$2,$3)", [
        otherShop,
        "{}",
        "2026-10-08",
      ]),
      /noAccess/,
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${owner}';set role authenticated;`,
    );
    await assert.rejects(page(), /noAccess/);
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select shop_records_page($1)", [shop]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
