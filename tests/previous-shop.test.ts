import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  PreviousShopSession,
  previousShopImeis,
  hasPreviousShopHistory,
  type PreviousShopResult,
} from "../src/domain/previous-shop";
import { emptyPerson, emptyPhone, emptyShop } from "../src/domain/models";
import { previousShopHandler } from "../supabase/functions/_shared/previous-shop-handler";
import { demoPreviousShopResult } from "../src/data/demo-previous-shop";

test("previous-shop UI stays hidden until a successful lookup returns history", async () => {
  let complete!: (result: PreviousShopResult) => void;
  const session = new PreviousShopSession(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  assert.equal(hasPreviousShopHistory(session.snapshot()), false);
  const lookup = session.run(true);
  assert.equal(hasPreviousShopHistory(session.snapshot()), false);
  complete(demoPreviousShopResult(["490154203237518"], "history"));
  await lookup;
  assert.equal(hasPreviousShopHistory(session.snapshot()), true);
  session.clear();
  assert.equal(hasPreviousShopHistory(session.snapshot()), false);
  for (const status of [
    "loading",
    "ready",
    "disabled",
    "error",
    "result",
  ] as const) {
    assert.equal(hasPreviousShopHistory({ status, matches: [] }), false);
  }
  assert.deepEqual(
    demoPreviousShopResult(["352099001761481"], "history").matches,
    [],
  );
});

test("lookup lifecycle discards late results after changes, retries, background and disposal", async () => {
  const pending: ((v: PreviousShopResult) => void)[] = [];
  const session = new PreviousShopSession(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const first = session.run(true);
  session.clear();
  pending[0]({
    enabled: true,
    matches: [
      {
        imeis: ["490154203237518"],
        shopName: "Stale",
        phone: "",
        address: "",
        occurredAt: "",
        direction: "buy",
      },
    ],
  });
  await first;
  assert.equal(session.snapshot().status, "loading");
  assert.deepEqual(session.snapshot().matches, []);
  const second = session.run(true),
    third = session.run(false);
  pending[2]({ enabled: false });
  await third;
  pending[1]({ enabled: true, matches: [] });
  await second;
  assert.equal(session.snapshot().status, "disabled");
  const failed = new PreviousShopSession(async () => {
    throw new Error("previousShopOffline");
  });
  await failed.run(true);
  assert.equal(failed.snapshot().error, "previousShopOffline");
  assert.deepEqual(
    previousShopImeis(["۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸", "490154203237518", "short"]),
    ["490154203237518"],
  );
});

test("edge handler requires authenticated identity, limits inputs and does not trust actor supplied by client", async () => {
  const actor = randomUUID(),
    shopId = randomUUID();
  const calls: { rpc: string; args: Record<string, unknown> }[] = [];
  let response: object = { enabled: false, matches: [] };
  const handler = previousShopHandler({
    authenticate: async (token) => (token === "valid" ? actor : null),
    call: async (rpc, args) => {
      calls.push({ rpc, args });
      return { data: response, error: null };
    },
  });
  const send = (body: object, token = "valid") =>
    handler(
      new Request("https://example.test", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await send({}, "")).status, 401);
  assert.equal((await send({}, "bad")).status, 401);
  assert.equal(
    (await send({ action: "lookup", shopId, imeis: ["short"] })).status,
    400,
  );
  assert.equal(
    (
      await send({
        action: "lookup",
        shopId,
        imeis: Array(3).fill("490154203237518"),
      })
    ).status,
    400,
  );
  const result = await send({
    action: "lookup",
    shopId,
    imeis: ["490154203237518"],
    actor: "forged",
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(calls[0].args.p_actor, actor);
  assert.equal(calls[0].rpc, "previous_shop_lookup");
  response = { error: "noAccess" };
  assert.equal((await send({ action: "admin-status" })).status, 403);
  response = { error: "previousShopRateLimited" };
  assert.equal(
    (await send({ action: "lookup", shopId, imeis: ["490154203237518"] }))
      .status,
    429,
  );
  response = { error: "conflict" };
  assert.equal(
    (await send({ action: "admin-set", enabled: true, version: 1 })).status,
    409,
  );
});

test("database lookup: backfill, exact dual matches, corrections, voids, isolation, admin permissions and quota", async () => {
  const db = new PGlite();
  const owner = randomUUID(),
    staff = randomUUID(),
    admin = randomUUID(),
    otherOwner = randomUUID();
  const shop = randomUUID(),
    other = randomUUID(),
    third = randomUUID();
  const imei1 = "490154203237518",
    imei2 = "356938035643809",
    correctedImei = "123456789012345";
  const record = (
    shopId: string,
    occurredAt: string,
    phone = { imei1, imei2 },
    direction = "buy",
  ) => ({
    id: randomUUID(),
    reference: "TEST",
    shopId,
    createdBy: shopId === shop ? owner : otherOwner,
    direction,
    phone: { ...emptyPhone(), model: "Test", ...phone },
    customer: {
      ...emptyPerson(),
      name: "Private customer",
      idNumber: "Private ID",
    },
    customerId: randomUUID(),
    shop: emptyShop(),
    price: "100",
    currency: "AFN",
    occurredAt,
    templateVersion: "draft-v1",
    syncState: "synced",
  });
  type Record = ReturnType<typeof record>;
  const insert = (r: Record, createdAt = "2026-10-08T00:00:00Z") =>
    db.query(
      "insert into public.records(id,shop_id,created_by,snapshot,created_at) values($1,$2,$3,$4,$5)",
      [r.id, r.shopId, r.createdBy, JSON.stringify(r), createdAt],
    );
  const rpc = async (
    imeis: string[] | null = [imei1, imei2],
    actor = staff,
    requestShop = shop,
  ) =>
    (
      await db.query<{
        value: {
          enabled?: boolean;
          error?: string;
          matches: {
            imeis: string[];
            shopName: string;
            shopNumber: string;
            phone: string;
            address: string;
            direction: string;
          }[];
        };
      }>("select public.previous_shop_lookup($1,$2,$3) value", [
        actor,
        requestShop,
        imeis,
      ])
    ).rows[0].value;
  const toggle = async (
    enabled: boolean | null,
    version: number | null,
    actor = admin,
  ) =>
    (
      await db.query<{
        value: { enabled?: boolean; error?: string; version: number };
      }>("select public.previous_shop_admin($1,$2,$3) value", [
        actor,
        enabled,
        version,
      ])
    ).rows[0].value;
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema private;grant usage on schema private to service_role;`,
    );
    for (const file of [
      "20261001072643_mobile_records",
      "20261003111750_hosted_access_hardening",
      "20261003113354_admin_login_codes",
      "20261003114346_admin_portal_management",
      "20261003120000_fingerprint_templates",
      "20261003120001_fingerprint_profiles",
      "20261003130510_cloud_record_storage",
      "20261004112532_audited_record_customer_edits",
      "20261006082626_align_record_imei_validation",
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}.sql`, "utf8"));
    await db.exec(
      `insert into auth.users values('${owner}'),('${staff}'),('${admin}'),('${otherOwner}'); insert into public.account_status values('${owner}',false),('${staff}',false),('${otherOwner}',false); insert into public.shops(id,profile) values('${shop}','{}'),('${other}','{"shopName":"Other shop","shopNumber":"42","phone":"+93700123456","address":"Business street","name":"PRIVATE OWNER"}'),('${third}','{"shopName":"Third shop"}');insert into public.memberships values('${shop}','${owner}','owner',true),('${shop}','${staff}','staff',true),('${other}','${otherOwner}','owner',true),('${third}','${otherOwner}','owner',true);insert into private.platform_administrators values('${admin}',true);`,
    );
    const old = record(other, "2026-10-01T00:00:00Z");
    await insert(old);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261008063706_previous_shop_lookup.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261008075246_previous_shop_number.sql",
        "utf8",
      ),
    );
    await db.exec("set role service_role");
    assert.equal((await rpc()).enabled, false);
    assert.equal((await toggle(true, 1, owner)).error, "noAccess");
    assert.equal((await toggle(true, 1)).enabled, true);
    assert.equal((await toggle(false, 1)).error, "conflict");
    let result = await rpc();
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].shopNumber, "42");
    assert.deepEqual(result.matches[0].imeis, [imei2, imei1].sort());
    assert.deepEqual(
      Object.keys(result.matches[0]).sort(),
      [
        "imeis",
        "shopName",
        "shopNumber",
        "phone",
        "address",
        "occurredAt",
        "direction",
      ].sort(),
    );
    assert.doesNotMatch(
      JSON.stringify(result),
      /PRIVATE|customer|price|fingerprint/,
    );
    await db.exec("reset role");
    await insert(record(shop, "2026-10-07T00:00:00Z"));
    const newer = record(
      third,
      "2026-10-06T00:00:00Z",
      { imei1: imei2, imei2: "" },
      "sell",
    );
    await insert(newer);
    await db.exec("set role service_role");
    result = await rpc();
    assert.equal(result.matches.length, 2);
    assert.equal(result.matches[0].shopName, "Third shop");
    assert.equal(result.matches[0].phone, "");
    assert.equal(result.matches[0].direction, "sell");
    assert.equal((await rpc([imei1], otherOwner, shop)).error, "noAccess");
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${staff}'`,
    );
    assert.equal(
      (await db.query("select * from records where shop_id=$1", [other])).rows
        .length,
      0,
    );
    await assert.rejects(rpc(), /permission denied/);
    await assert.rejects(toggle(true, 2), /permission denied/);
    await assert.rejects(
      db.query("select * from private.previous_shop_imeis"),
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${otherOwner}'`,
    );
    const amended = {
      ...old,
      phone: { ...old.phone, imei1: correctedImei, imei2: "" },
    };
    const correctionId = randomUUID();
    const amend = async (
      kind: string,
      id: string,
      previous: string | null,
      snapshot: Record,
      extra = {},
    ) =>
      db.query(
        "insert into amendments(id,shop_id,record_id,created_by,payload) values($1,$2,$3,$4,$5)",
        [
          id,
          other,
          old.id,
          otherOwner,
          JSON.stringify({
            id,
            recordId: old.id,
            createdBy: otherOwner,
            createdAt: new Date().toISOString(),
            reason: "Checked source",
            kind,
            previousAmendmentId: previous,
            snapshot,
            ...extra,
          }),
        ],
      );
    await amend("correction", correctionId, null, amended);
    const photoId = randomUUID();
    await amend("photo", photoId, correctionId, old, {
      photoChange: { slot: "person", action: "replace" },
    });
    await db.exec("reset role;set role service_role");
    assert.equal((await rpc([imei1])).matches.length, 0);
    assert.equal(
      (await rpc([correctedImei])).matches[0].shopName,
      "Other shop",
    );
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${otherOwner}'`,
    );
    await amend("void", randomUUID(), photoId, old);
    await db.exec("reset role;set role service_role");
    assert.equal((await rpc([correctedImei])).matches.length, 0);
    // Equal transaction dates prefer server creation time, then record ID.
    await db.exec("reset role");
    const tiedImei = "111222333444555";
    const firstTie = record(other, "2026-10-07T00:00:00Z", {
      imei1: tiedImei,
      imei2: "",
    });
    const secondTie = record(third, "2026-10-07T00:00:00Z", {
      imei1: tiedImei,
      imei2: "",
    });
    await insert(firstTie, "2026-10-08T01:00:00Z");
    await insert(secondTie, "2026-10-08T02:00:00Z");
    await db.exec("set role service_role");
    assert.equal((await rpc([tiedImei])).matches[0].shopName, "Third shop");
    await db.exec("reset role");
    const thirdTie = {
      ...record(other, "2026-10-07T00:00:00Z", { imei1: tiedImei, imei2: "" }),
      id: "ffffffff-ffff-4fff-bfff-ffffffffffff" as const,
    };
    await insert(thirdTie, "2026-10-08T02:00:00Z");
    await db.query(
      "update public.shops set profile=jsonb_set(profile,'{shopName}',to_jsonb('Current business name'::text)),version=version+1 where id=$1",
      [other],
    );
    await db.exec("set role service_role");
    assert.equal(
      (await rpc([tiedImei])).matches[0].shopName,
      "Current business name",
    );
    assert.equal((await rpc(["11122233344455"])).error, "invalidImei");
    assert.equal((await rpc([tiedImei, tiedImei])).matches.length, 1);
    await db.exec("reset role;set role anon");
    await assert.rejects(rpc(), /permission denied/);
    await assert.rejects(
      db.query("select * from public.records"),
      /permission denied/,
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${staff}';set role service_role`,
    );
    assert.equal((await rpc()).error, "noAccess");
    assert.equal((await rpc(null)).error, "noAccess");
    await db.exec(
      `reset role;update memberships set active=true where user_id='${staff}';delete from private.previous_shop_lookup_audit;set role service_role`,
    );
    for (let i = 0; i < 30; i++)
      assert.equal((await rpc([imei1])).enabled, true);
    assert.equal((await rpc([imei1])).error, "previousShopRateLimited");
    await toggle(false, 2);
    assert.equal((await rpc(null)).enabled, false);
    await db.exec("reset role");
    const audit = await db.query<{ enabled: boolean }>(
      "select enabled from private.previous_shop_feature_audit order by id",
    );
    assert.deepEqual(
      audit.rows.map((x) => x.enabled),
      [true, false],
    );
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='private' and table_name='previous_shop_lookup_audit'",
    );
    assert.ok(columns.rows.every((x) => !x.column_name.includes("imei")));
    const overview = (
      await db.query<{ data: { recentActivity: { action: string }[] } }>(
        "select public.admin_overview() data",
      )
    ).rows[0].data;
    assert.ok(
      overview.recentActivity.some(
        (e) => e.action === "previous_shop_disabled",
      ),
    );
  } finally {
    await db.close();
  }
});
