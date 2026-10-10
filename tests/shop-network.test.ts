import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("shop network consent, private fields, staff grants, moderation, transitions and revocation", async () => {
  const db = new PGlite();
  const a = randomUUID(),
    b = randomUUID(),
    c = randomUUID(),
    admin = randomUUID(),
    staff = randomUUID();
  const sa = randomUUID(),
    sb = randomUUID(),
    sc = randomUUID();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,phone text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261001072643_mobile_records.sql",
        "utf8",
      ),
    );
    await db.exec(
      `create schema private;create table private.platform_administrators(user_id uuid primary key,active boolean default true);`,
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261010123711_private_shop_network.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261010124208_network_audit_boundaries.sql",
        "utf8",
      ),
    );
    await db.exec(
      `insert into auth.users(id) values('${a}'),('${b}'),('${c}'),('${admin}'),('${staff}');insert into account_status values('${a}',false),('${b}',false),('${c}',false),('${staff}',false);insert into shops(id,profile) values('${sa}','{}'),('${sb}','{}'),('${sc}','{}');insert into memberships values('${sa}','${a}','owner',true),('${sb}','${b}','owner',true),('${sc}','${c}','owner',true),('${sa}','${staff}','staff',true);insert into private.platform_administrators values('${admin}',true);`,
    );
    async function as(user: string) {
      await db.exec(
        `reset role;set request.jwt.claim.sub='${user}';set role authenticated`,
      );
    }
    async function rpc(
      shop: string | null,
      action: string,
      data: Record<string, unknown> = {},
    ) {
      return (
        await db.query<{ r: any }>("select public.shop_network($1,$2,$3) r", [
          shop,
          action,
          JSON.stringify(data),
        ])
      ).rows[0].r;
    }
    for (const [user, shop, name] of [
      [a, sa, "First"],
      [b, sb, "Second"],
      [c, sc, "Third"],
    ]) {
      await as(user);
      await rpc(shop, "profile", {
        name,
        area: "Kabul",
        contact: "Business contact",
        version: 0,
      });
      await assert.rejects(
        rpc(shop, "list", { section: "directory" }),
        /networkApproval/,
      );
      await assert.rejects(
        rpc(shop, "admin-review", {
          target: shop,
          status: "approved",
          reason: "Reviewed",
          version: 1,
        }),
        /noAccess/,
      );
      await as(admin);
      await rpc(null, "admin-review", {
        target: shop,
        status: "approved",
        reason: "Reviewed",
        version: 1,
      });
    }
    await as(a);
    assert.equal(
      (await rpc(sa, "list", { section: "directory" })).items.length,
      2,
    );
    await assert.rejects(rpc(sb, "status"), /noAccess/);
    await assert.rejects(
      db.query("select * from private.network_posts"),
      /permission denied/,
    );
    await db.exec("reset role");
    const privateRecordId = randomUUID();
    await db.query(
      "insert into records(id,shop_id,created_by,snapshot) values($1,$2,$3,$4)",
      [
        privateRecordId,
        sb,
        b,
        JSON.stringify({
          id: privateRecordId,
          shopId: sb,
          createdBy: b,
          direction: "buy",
          currency: "AFN",
          templateVersion: "draft-v1",
          price: "100",
          phone: { model: "Private device", imei1: "490154203237518" },
          customer: {
            name: "PRIVATE CUSTOMER",
            idNumber: "0000-0000-00000",
            fingerprint: "PRIVATE TEMPLATE",
          },
        }),
      ],
    );
    await as(a);
    assert.equal((await db.query("select * from records")).rows.length, 0);
    await rpc(sa, "connect", { target: sb, version: 0 });
    await assert.rejects(
      rpc(sa, "accept", { target: sb, version: 1 }),
      /networkUnavailable/,
    );
    const d = {
      brand: "Acme",
      model: "One",
      storage: "128 GB",
      color: "Blue",
      price: "5000",
    };
    const post = randomUUID();
    await assert.rejects(
      rpc(sa, "post", { id: post, kind: "offer", device: d, recipients: [sb] }),
      /networkUnavailable/,
    );
    await as(b);
    await rpc(sb, "accept", { target: sa, version: 1 });
    await as(staff);
    assert.deepEqual((await rpc(sa, "status")).members, []);
    await assert.rejects(rpc(sa, "list", { section: "audit" }), /noAccess/);
    await assert.rejects(
      rpc(sa, "post", { id: post, kind: "offer", device: d, recipients: [sb] }),
      /noAccess/,
    );
    await as(a);
    await rpc(sa, "permission", { target: staff, enabled: true });
    await rpc(sa, "permission", {
      target: staff,
      enabled: true,
      recipients: ["PRIVATE TEMPLATE"],
      status: "PRIVATE CUSTOMER",
    });
    assert.ok(
      !JSON.stringify(await rpc(sa, "list", { section: "audit" })).includes(
        "PRIVATE",
      ),
    );
    await as(staff);
    await rpc(sa, "post", {
      id: post,
      kind: "offer",
      device: d,
      recipients: [sb],
    });
    await rpc(sa, "post", {
      id: post,
      kind: "offer",
      device: d,
      recipients: [sb],
    });
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "offer",
        device: { ...d, customer: { name: "PRIVATE" } },
        recipients: [sb],
      }),
      /networkInvalid/,
    );
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "offer",
        device: { ...d, model: "490154203237518" },
        recipients: [sb],
      }),
      /networkPrivate/,
    );
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "offer",
        device: { ...d, model: "۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸" },
        recipients: [sb],
      }),
      /networkPrivate/,
    );
    await as(b);
    assert.equal((await rpc(sb, "list", { section: "board" })).items.length, 1);
    await as(c);
    assert.equal((await rpc(sc, "list", { section: "board" })).items.length, 0);
    await as(a);
    const audit = JSON.stringify(await rpc(sa, "list", { section: "audit" }));
    assert.ok(!audit.includes("490154203237518"));
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "offer",
        device: { ...d, model: { name: "Bad" } },
        recipients: [sb],
      }),
      /networkInvalid/,
    );
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "offer",
        device: { ...d, imei: "490154203237518" },
        recipients: [sb],
      }),
      /networkInvalid/,
    );
    await db.exec("reset role");
    // More than one page, with full server-side audience filtering and expiry.
    for (let i = 0; i < 31; i++) {
      const id = randomUUID();
      await db.query(
        "insert into private.network_posts(id,shop_id,kind,device) values($1,$2,'request',$3)",
        [id, sa, JSON.stringify({ ...d, model: "Page " + i })],
      );
      await db.query("insert into private.network_audience values($1,$2)", [
        id,
        sb,
      ]);
    }
    await as(b);
    const first = await rpc(sb, "list", { section: "board" });
    const second = await rpc(sb, "list", {
      section: "board",
      offset: first.next,
    });
    assert.equal(first.items.length, 25);
    assert.equal(second.items.length, 7);
    assert.equal(second.next, null);
    assert.equal(
      new Set([...first.items, ...second.items].map((x) => x.id)).size,
      32,
    );
    assert.equal(
      (await rpc(sb, "list", { section: "board", query: "Page 30" })).items
        .length,
      1,
    );
    await as(a);
    await rpc(sa, "close-post", { id: post });
    await db.exec("reset role");
    await db.query(
      "update private.network_posts set expires_at=now()-interval '1 second' where device->>'model'='Page 30'",
    );
    await as(b);
    assert.equal(
      (await rpc(sb, "list", { section: "board", query: "Page 30" })).items
        .length,
      0,
    );
    await as(a);
    await assert.rejects(
      rpc(sa, "list", { section: "exchanges" }),
      /networkInvalid/,
    );
    await assert.rejects(rpc(sa, "exchange", {}), /networkInvalid/);
    await rpc(sa, "block", { target: sb });
    await as(b);
    assert.equal((await rpc(sb, "list", { section: "board" })).items.length, 0);
    await assert.rejects(
      rpc(sb, "connect", { target: sa, version: 3 }),
      /networkUnavailable/,
    );
    await as(a);
    await rpc(sa, "unblock", { target: sb });
    assert.equal(
      (await rpc(sa, "list", { section: "connections" })).items[0]
        .connection_status,
      "disconnected",
    );
    await rpc(sa, "connect", { target: sb, version: 3 });
    await as(b);
    await rpc(sb, "accept", { target: sa, version: 4 });
    await as(a);
    await rpc(sa, "permission", { target: staff, enabled: false });
    await as(staff);
    await assert.rejects(
      rpc(sa, "post", {
        id: randomUUID(),
        kind: "request",
        device: d,
        recipients: [sb],
      }),
      /noAccess/,
    );
    await db.exec(
      `reset role;update memberships set active=false where user_id='${staff}';set role authenticated`,
    );
    await assert.rejects(rpc(sa, "status"), /noAccess/);
    await as(a);
    await rpc(sa, "report", {
      id: randomUUID(),
      target: sb,
      reason: "Please review this business listing",
    });
    await as(admin);
    assert.equal(
      (await rpc(null, "admin-list", { section: "reports" })).items.length,
      1,
    );
    await rpc(null, "admin-review", {
      target: sb,
      status: "suspended",
      reason: "Review report",
      version: 2,
    });
    await as(a);
    assert.equal(
      (await rpc(sa, "list", { section: "directory" })).items.some(
        (x: any) => x.shop_id === sb,
      ),
      false,
    );
    await as(b);
    await rpc(sb, "profile", {
      name: "Renamed",
      area: "Kabul",
      contact: "",
      version: 3,
      enabled: true,
    });
    assert.equal((await rpc(sb, "status")).profile.status, "suspended");
    await as(a);
    await db.exec("reset role");
    await db.query(
      "insert into private.network_audit(actor,shop_id,action,details) select $1,$2,'test','{}' from generate_series(1,40)",
      [a, sa],
    );
    await as(a);
    await assert.rejects(
      rpc(sa, "report", {
        id: randomUUID(),
        target: sb,
        reason: "Too many requests",
      }),
      /networkRate/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(rpc(sa, "status"), /permission denied/);
  } finally {
    await db.close();
  }
});
