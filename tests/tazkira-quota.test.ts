import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
const shop = "10000000-0000-4000-8000-000000000001";
const user = "20000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `30000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
test("database enforces OCR access, duplicate, rolling quota and concurrent reservation boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create table memberships(user_id uuid,shop_id uuid,active boolean); create table account_status(user_id uuid,must_change_password boolean); grant select on memberships,account_status to service_role; insert into memberships values('${user}','${shop}',true); insert into account_status values('${user}',false);`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261003101348_tazkira_ocr_usage.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const reserve = async (n: number) =>
      (
        await db.query<{ result: string }>(
          "select reserve_tazkira_ocr($1,$2,$3) result",
          [id(n), user, shop],
        )
      ).rows[0].result;
    await db.exec("set role service_role");
    assert.equal(await reserve(1), "ok");
    assert.equal(await reserve(1), "duplicateScan");
    for (let n = 2; n <= 10; n++) assert.equal(await reserve(n), "ok");
    assert.equal(await reserve(11), "onlineRateLimited");
    await db.exec(
      "reset role; update memberships set active=false; set role service_role",
    );
    assert.equal(await reserve(12), "noAccess");
    await db.exec(
      "reset role; update memberships set active=true; update account_status set must_change_password=true; set role service_role",
    );
    assert.equal(await reserve(13), "noAccess");
    await db.exec(
      `reset role; update account_status set must_change_password=false; truncate private.tazkira_ocr_usage; insert into private.tazkira_ocr_usage select md5(i::text)::uuid,'${user}','${shop}',now()-interval '2 days' from generate_series(1,899) i; set role service_role;`,
    );
    const simultaneous = await Promise.all([
      reserve(1001),
      reserve(1002),
      reserve(1003),
    ]);
    assert.equal(simultaneous.filter((v) => v === "ok").length, 1);
    assert.equal(
      simultaneous.filter((v) => v === "onlineQuotaReached").length,
      2,
    );
    await db.exec(
      "reset role; update private.tazkira_ocr_usage set reserved_at=now()-interval '33 days'; set role service_role",
    );
    assert.equal(await reserve(1004), "ok");
    await db.exec("reset role; set role authenticated");
    await assert.rejects(reserve(1005), /permission denied/);
    await assert.rejects(
      db.query("select * from private.tazkira_ocr_usage"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
