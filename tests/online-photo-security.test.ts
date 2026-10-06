import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const owner = "10000000-0000-4000-8000-000000000001",
  staff = "10000000-0000-4000-8000-000000000002",
  outsider = "10000000-0000-4000-8000-000000000003",
  admin = "10000000-0000-4000-8000-000000000004";
const shop = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002",
  record = "30000000-0000-4000-8000-000000000001";
const pid = (n: number) =>
  `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const name of [
    "20261001072643_mobile_records",
    "20261003111750_hosted_access_hardening",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.exec(
    `create function public.is_platform_administrator(u uuid) returns boolean language sql as $$select u='${admin}'::uuid$$;`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261006074420_online_record_photos.sql",
      "utf8",
    ),
  );
  await db.exec(
    `insert into auth.users values('${owner}'),('${staff}'),('${outsider}'),('${admin}');insert into account_status values('${owner}',false),('${staff}',false),('${outsider}',false);insert into shops(id,profile)values('${shop}','{}'),('${other}','{}');insert into memberships values('${shop}','${owner}','owner',true),('${shop}','${staff}','staff',true),('${other}','${outsider}','owner',true);insert into records(id,shop_id,created_by,snapshot)values('${record}','${shop}','${owner}','{"id":"${record}","shopId":"${shop}","createdBy":"${owner}","direction":"buy","currency":"AFN","templateVersion":"draft-v1","price":100,"customer":{"name":"Synthetic","idNumber":"test"},"phone":{"model":"Test","imei1":"490154203237518"}}');set role service_role;`,
  );
  const rpc = async (actor: string, action: string, p: object = {}) =>
    (
      await db.query<{ value: any }>(
        "select photo_service($1,$2,$3) as value",
        [
          actor,
          action,
          JSON.stringify({ shopId: shop, recordId: record, ...p }),
        ],
      )
    ).rows[0].value;
  return { db, rpc };
}
const upload = (n = 1, baseRevision = 0) => ({
  id: pid(n),
  slot: "person",
  bytes: 100,
  md5: "a".repeat(32),
  previewBytes: 20,
  previewMd5: "b".repeat(32),
  baseRevision,
  reason: baseRevision ? "Owner correction" : "",
});
test("photo grants default off, owner-only requests, admin-only quotas and shop isolation", async () => {
  const { db, rpc } = await setup();
  try {
    assert.equal((await rpc(owner, "status")).entitlement.enabled, false);
    await assert.rejects(rpc(owner, "prepare", upload()), /photoUploadsPaused/);
    await assert.rejects(rpc(staff, "request"), /noAccess/);
    await rpc(owner, "request");
    await rpc(owner, "request");
    assert.equal((await rpc(admin, "admin-requests")).length, 1);
    await assert.rejects(
      rpc(owner, "admin-set", {
        enabled: true,
        quotaBytes: 1000,
        reason: "test",
      }),
      /noAccess/,
    );
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 1000,
      reason: "approved",
    });
    assert.equal((await rpc(owner, "status")).request.status, "approved");
    await assert.rejects(rpc(outsider, "list"), /noAccess/);
    await db.exec(
      `reset role;set role authenticated;set request.jwt.claim.sub='${outsider}'`,
    );
    assert.equal(
      (await db.query("select * from photo_entitlements")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select photo_service($1,$2,$3)", [admin, "admin-set", "{}"]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update photo_entitlements set enabled=true"),
      /permission denied/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from record_photos"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("admins can enable without a request; quota reservations and replacements remain protected", async () => {
  const { db, rpc } = await setup();
  try {
    assert.equal((await rpc(owner, "status")).request, null);
    for (const actor of [owner, staff]) {
      await assert.rejects(
        rpc(actor, "admin-set", {
          enabled: true,
          quotaBytes: 240,
          reason: "No request submitted",
        }),
        /noAccess/,
      );
    }
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 240,
      reason: "pilot",
    });
    const status = await rpc(owner, "status");
    assert.equal(status.entitlement.enabled, true);
    assert.equal(status.entitlement.quota_bytes, 240);
    assert.equal(status.request, null, "Direct activation must not fabricate a shop request");
    assert.deepEqual(await rpc(admin, "admin-requests"), []);
    await rpc(owner, "prepare", upload());
    await rpc(owner, "prepare", upload());
    assert.equal((await rpc(owner, "status")).entitlement.reserved_bytes, 120);
    await rpc(owner, "prepare", upload(2));
    await assert.rejects(rpc(owner, "prepare", upload(3)), /photoStorageFull/);
    await rpc(owner, "complete", upload());
    await rpc(owner, "complete", upload());
    assert.equal((await rpc(owner, "status")).entitlement.used_bytes, 120);
    await assert.rejects(rpc(owner, "complete", upload(2)), /conflict/);
    await assert.rejects(
      rpc(staff, "remove", {
        slot: "person",
        baseRevision: 1,
        reason: "remove",
      }),
      /photoOwnerOnly/,
    );
    await rpc(admin, "admin-set", {
      enabled: false,
      quotaBytes: 240,
      reason: "pause",
    });
    assert.equal((await rpc(owner, "read", { id: pid(1) })).state, "current");
    await assert.rejects(
      rpc(owner, "prepare", upload(4, 1)),
      /photoUploadsPaused/,
    );
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 500,
      reason: "upgrade",
    });
    await rpc(owner, "prepare", upload(4, 1));
    await rpc(owner, "complete", upload(4, 1));
    const list = await rpc(owner, "list", { history: true });
    assert.equal(
      list.photos.filter((p: any) => p.state === "retained").length,
      1,
    );
    assert.equal(list.heads[0].revision, 2);
    await assert.rejects(
      rpc(owner, "remove", {
        slot: "person",
        baseRevision: 1,
        reason: "stale",
      }),
      /conflict/,
    );
    await rpc(owner, "remove", {
      slot: "person",
      baseRevision: 2,
      reason: "removed",
    });
    assert.equal((await rpc(owner, "list")).heads[0].photo_id, null);
    await db.exec(
      `reset role;update record_photos set delete_after=now()-interval '1 day' where state in ('pending','retained');set role service_role;`,
    );
    const clean = (await db.query<{ v: any[] }>("select photo_cleanup() as v"))
      .rows[0].v;
    assert.equal(clean.length, 3);
    for (const p of clean) {
      await db.query("select photo_cleanup($1)", [p.id]);
      await db.query("select photo_cleanup($1)", [p.id]);
    }
    const final = await rpc(owner, "status");
    assert.equal(final.entitlement.used_bytes, 0);
    assert.equal(final.entitlement.reserved_bytes, 0);
  } finally {
    await db.close();
  }
});
test("revoked members cannot prepare or finish uploads; malformed sizes and reusing another payload fail", async () => {
  const { db, rpc } = await setup();
  try {
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 99999999,
      reason: "pilot",
    });
    await assert.rejects(rpc(owner, "prepare", { ...upload(), bytes: -10 }));
    await assert.rejects(
      rpc(owner, "prepare", { ...upload(), bytes: 10485761 }),
    );
    await rpc(owner, "prepare", upload());
    await assert.rejects(
      rpc(owner, "prepare", { ...upload(), md5: "c".repeat(32) }),
      /conflict/,
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${owner}';set role service_role;`,
    );
    await assert.rejects(rpc(owner, "complete", upload()), /noAccess/);
    await assert.rejects(rpc(owner, "read", { id: pid(1) }), /noAccess/);
  } finally {
    await db.close();
  }
});

test("required revisions, upload failures, disabled completion and reconciliation stay consistent", async () => {
  const { db, rpc } = await setup();
  try {
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 500,
      reason: "synthetic pilot",
    });
    await assert.rejects(
      rpc(owner, "prepare", { ...upload(), baseRevision: null }),
      /photoInvalidRequest/,
    );
    await rpc(owner, "prepare", upload());
    await rpc(owner, "failed", { id: pid(1), code: "photoChecksumFailed" });
    assert.equal((await rpc(admin, "admin-status")).failed, 1);
    await assert.rejects(
      rpc(staff, "failed", { id: pid(1), code: "photoUploadFailed" }),
      /noAccess/,
    );
    await rpc(admin, "admin-set", {
      enabled: false,
      quotaBytes: 500,
      reason: "pause during upload",
    });
    await assert.rejects(
      rpc(owner, "complete", upload()),
      /photoUploadsPaused/,
    );
    await rpc(admin, "admin-set", {
      enabled: true,
      quotaBytes: 500,
      reason: "resume",
    });
    await rpc(owner, "complete", upload());
    await rpc(admin, "admin-set", {
      enabled: false,
      quotaBytes: 500,
      reason: "pause after completion",
    });
    assert.equal((await rpc(owner, "prepare", upload())).state, "current");
    await assert.rejects(
      rpc(owner, "remove", { slot: "person", reason: "missing revision" }),
      /photoInvalidRequest/,
    );
    await db.exec(
      `reset role;update photo_entitlements set used_bytes=1,reserved_bytes=99 where shop_id='${shop}';set role service_role;`,
    );
    await db.query("select photo_reconcile()");
    const status = await rpc(owner, "status");
    assert.equal(status.entitlement.used_bytes, 120);
    assert.equal(status.entitlement.reserved_bytes, 0);
  } finally {
    await db.close();
  }
});
