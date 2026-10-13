import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { demoNetwork } from "../src/features/network/demo";
import type { NetworkPage, NetworkPost } from "../src/features/network/types";

test("demo network loads 20 at a time and filters before paginating", async () => {
  const call = demoNetwork("my-shop");
  for (let i = 0; i < 40; i++) {
    await call("post", {
      id: `phone-${i}`,
      kind: "offer",
      device: { brand: "Test", model: `Phone ${i}` },
    });
  }
  const list = (data = {}) =>
    call<NetworkPage<NetworkPost>>("list", { section: "board", ...data });
  const first = await list();
  const second = await list({ offset: first.next });
  const last = await list({ offset: second.next });
  assert.deepEqual(
    [first.items.length, second.items.length, last.items.length],
    [20, 20, 1],
  );
  assert.equal(last.next, null);
  assert.equal(
    new Set(
      [...first.items, ...second.items, ...last.items].map((row) => row.id),
    ).size,
    41,
  );
  assert.equal((await list({ limit: 1000 })).items.length, 20);
  const filtered = await list({ query: "Phone 39" });
  assert.equal(filtered.items[0].id, "phone-39");
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.next, null);
});

test("network SQL caps every mobile list, keeps stable IDs and filters before paging", async () => {
  const db = new PGlite();
  const actor = randomUUID(),
    shop = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, phone text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261001072643_mobile_records.sql",
        "utf8",
      ),
    );
    await db.exec(
      "create schema private; create table private.platform_administrators(user_id uuid primary key, active boolean default true);",
    );
    for (const file of [
      "20261010123711_private_shop_network.sql",
      "20261010124208_network_audit_boundaries.sql",
      "20261013065014_shop_network_page_size.sql",
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    await db.exec(`insert into auth.users(id) values('${actor}'); insert into account_status values('${actor}',false);
      insert into shops(id,profile) values('${shop}','{}'); insert into memberships values('${shop}','${actor}','owner',true);
      insert into private.network_profiles(shop_id,name,area,status) values('${shop}','My shop','Kabul','approved');`);
    for (let i = 0; i < 41; i++) {
      const peer = randomUUID(),
        post = randomUUID();
      await db.exec(`insert into shops(id,profile) values('${peer}','{}');
        insert into private.network_profiles(shop_id,name,area,status) values('${peer}','Shop ${String(i).padStart(2, "0")}','Kabul','approved');
        insert into private.network_connections(low_id,high_id,requested_by,status,updated_at)
          values(least('${shop}'::uuid,'${peer}'::uuid),greatest('${shop}'::uuid,'${peer}'::uuid),'${peer}','accepted','2026-01-01');
        insert into private.network_posts(id,shop_id,kind,device,created_at)
          values('${post}','${peer}','offer','{"brand":"Test","model":"Phone ${i}"}','2026-01-01');
        insert into private.network_audience values('${post}','${shop}');
        insert into private.network_audit(actor,shop_id,action,details) values('${actor}','${shop}','post','{}');`);
    }
    await db.exec(
      `set request.jwt.claim.sub='${actor}'; set role authenticated;`,
    );
    const list = async (
      section: string,
      data: Record<string, unknown> = {},
    ) => {
      const result = await db.query<{
        r: NetworkPage<{ id?: string; shop_id?: string }>;
      }>("select public.shop_network($1,'list',$2) r", [
        shop,
        { section, ...data },
      ]);
      return result.rows[0].r;
    };
    for (const section of ["directory", "connections", "board", "audit"]) {
      const first = await list(section);
      const second = await list(section, { offset: first.next });
      const last = await list(section, { offset: second.next });
      assert.deepEqual(
        [first.items.length, second.items.length, last.items.length],
        [20, 20, 1],
        section,
      );
      assert.deepEqual(
        [first.next, second.next, last.next],
        [20, 40, null],
        section,
      );
      const rows = [...first.items, ...second.items, ...last.items];
      assert.equal(
        new Set(rows.map((row) => row.id ?? row.shop_id)).size,
        41,
        section,
      );
      assert.equal(
        (await list(section, { limit: 999 })).items.length,
        20,
        section,
      );
      assert.equal(
        (await list(section, { limit: 0 })).items.length,
        1,
        section,
      );
      const exactLast = await list(section, { offset: 21 });
      assert.equal(exactLast.items.length, 20);
      assert.equal(
        exactLast.next,
        null,
        "An exact final page must not show View more",
      );
      assert.deepEqual(await list(section, { offset: 41 }), {
        items: [],
        next: null,
      });
      if (section === "audit") {
        assert.ok(rows.every((row) => typeof row.id === "string"));
        assert.ok(
          BigInt(rows[0].id!) > BigInt(rows[1].id!),
          "Audit order must stay numeric",
        );
      } else {
        const filtered = await list(section, {
          query: section === "board" ? "Phone 40" : "Shop 40",
        });
        assert.equal(filtered.items.length, 1, section);
        assert.equal(filtered.next, null);
        assert.deepEqual(await list(section, { query: "does not exist" }), {
          items: [],
          next: null,
        });
      }
    }
  } finally {
    await db.close();
  }
});
