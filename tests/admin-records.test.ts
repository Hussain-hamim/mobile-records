import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { recordVersions } from "../src/features/admin/record-versions";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Transaction,
} from "../src/domain/models";
import { formHtml } from "../src/domain/print-template";

const file = "../supabase/functions/_shared/admin-records.ts";
const implementation = import(file);
async function readAdminRecords(
  admin: ReturnType<typeof client>["admin"],
  body: Record<string, unknown>,
  signPhoto?: (photo: { id: string }) => Promise<{ url: string }>,
) {
  return (await implementation).readAdminRecords(admin, body, signPhoto);
}
const shop = "10000000-0000-4000-8000-000000000001";
const user = "20000000-0000-4000-8000-000000000001";
const id = "30000000-0000-4000-8000-000000000001";
const snapshot: Transaction = {
  id,
  reference: "MR-TEST",
  shopId: shop,
  createdBy: user,
  direction: "buy",
  phone: emptyPhone(),
  customer: emptyPerson(),
  shop: emptyShop(),
  customerId: id,
  price: "100",
  currency: "AFN",
  occurredAt: "2026-10-06T08:00:00Z",
  templateVersion: "draft-v1",
  syncState: "synced",
};
function client(reply: (url: URL) => unknown) {
  const urls: URL[] = [];
  const admin = createClient(
    "https://example.supabase.co",
    "test-service-key",
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          urls.push(url);
          return new Response(JSON.stringify(reply(url)), {
            headers: {
              "content-type": "application/json",
              "content-range": "0-19/45",
            },
          });
        },
      },
    },
  );
  return { admin, urls };
}

test("record list applies both account and shop scopes, stable ordering, direction and pagination", async () => {
  const { admin, urls } = client(() => []);
  const result = await readAdminRecords(admin, {
    action: "list-records",
    shopId: shop,
    userId: user,
    page: 1,
    direction: "sell",
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.total, 45);
  const q = urls[0].searchParams;
  assert.equal(q.get("shop_id"), `eq.${shop}`);
  assert.equal(q.get("created_by"), `eq.${user}`);
  assert.equal(q.get("snapshot->>direction"), "eq.sell");
  assert.equal(q.get("order"), "created_at.desc,id.desc");
  assert.equal(q.get("offset"), "20");
  assert.equal(q.get("limit"), "20");
  assert.doesNotMatch(q.get("select")!, /template|fingerprint|photo|\*/i);
});
test("shop-wide view has no account restriction; empty records return zero items", async () => {
  const { admin, urls } = client(() => []);
  const result = await readAdminRecords(admin, {
    action: "list-records",
    shopId: shop,
  });
  assert.equal(urls[0].searchParams.has("created_by"), false);
  assert.deepEqual(result.data.records, []);
});
test("invalid or missing scopes and invalid filters never query the database", async () => {
  const { admin, urls } = client(() => []);
  for (const body of [
    {},
    { shopId: shop, userId: "" },
    { shopId: shop, page: -1 },
    { shopId: shop, direction: "anything" },
    { shopId: shop, page: 0.5 },
  ]) {
    assert.equal(
      (await readAdminRecords(admin, { action: "list-records", ...body }))
        .status,
      400,
    );
  }
  assert.equal(urls.length, 0);
});
test("detail is scoped to account/shop and amendments never load for a foreign or absent record", async () => {
  const { admin, urls } = client(() => []);
  const result = await readAdminRecords(admin, {
    action: "record-detail",
    shopId: shop,
    userId: user,
    recordId: id,
  });
  assert.equal(result.status, 404);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get("id"), `eq.${id}`);
  assert.equal(urls[0].searchParams.get("created_by"), `eq.${user}`);
  assert.equal(urls[0].searchParams.get("shop_id"), `eq.${shop}`);
});
test("detail loads the immutable snapshot and all amendment pages in the same shop", async () => {
  const { admin, urls } = client((url) =>
    url.pathname.endsWith("records")
      ? [{ snapshot }]
      : Number(url.searchParams.get("offset")) === 0
        ? Array.from({ length: 100 }, (_, i) => ({ payload: { id: i } }))
        : [{ payload: { id: 100 } }],
  );
  const result = await readAdminRecords(admin, {
    action: "record-detail",
    shopId: shop,
    userId: user,
    recordId: id,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.record, snapshot);
  assert.equal(result.data.amendments.length, 101);
  for (const url of urls.slice(1)) {
    assert.equal(url.searchParams.get("shop_id"), `eq.${shop}`);
    assert.equal(url.searchParams.get("record_id"), `eq.${id}`);
  }
});
test("anonymous and ordinary shop users cannot reach the admin record handlers", async () => {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  let calls = 0;
  const source = readFileSync(
    new URL("../supabase/functions/admin-accounts/index.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(
    source.replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, ""),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  const context = {
    Deno: {
      serve: (fn: typeof handler) => {
        handler = fn;
      },
      env: { get: () => "server-only-secret" },
    },
    adminClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: user } } }) },
      rpc: async () => ({ data: false }),
    }),
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    readAdminRecords: () => {
      calls++;
    },
    exports: {},
  };
  vm.runInNewContext(code, context);
  for (const action of ["list-records", "record-detail", "record-photos"]) {
    for (const token of [null, "ordinary-user-token"]) {
      const response = await handler(
        new Request("https://example.com", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: JSON.stringify({ action, shopId: shop }),
        }),
      );
      assert.equal(response.status, token ? 403 : 401);
    }
  }
  assert.equal(calls, 0);
});
test("correction printing preserves originals and photo changes cannot revert corrected fields; void applies to every version", () => {
  const corrected = { ...snapshot, price: "200" };
  const base = {
    recordId: id,
    reason: "Price corrected",
    createdBy: user,
    createdAt: "2026-10-06T09:00:00Z",
    syncState: "synced" as const,
  };
  const detail = {
    record: snapshot,
    amendments: [
      {
        ...base,
        id: "correction",
        snapshot: corrected,
        kind: "correction" as const,
      },
      { ...base, id: "photo", snapshot, kind: "photo" as const },
      { ...base, id: "void", snapshot, kind: "void" as const },
    ],
  };
  const versions = recordVersions(detail);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].snapshot.price, "100");
  assert.equal(versions[1].snapshot.price, "200");
  for (const version of versions) {
    assert.match(version.annotation!, /VOIDED/);
    assert.match(
      formHtml(version.snapshot, "en", "", true, version.annotation),
      /VOIDED/,
    );
  }
});

test("admin photos sign only current front/customer images after validating the record scope", async () => {
  const photo = {
    id: "photo-id",
    slot: "idFront",
    completed_at: "2026-10-06T09:00:00Z",
    shop_id: shop,
    record_id: id,
    state: "current",
  };
  const { admin, urls } = client((url) =>
    url.pathname.endsWith("record_photos") ? [photo] : [{ snapshot }],
  );
  const signed: string[] = [];
  const result = await readAdminRecords(
    admin,
    { action: "record-photos", shopId: shop, userId: user, recordId: id },
    async (p) => {
      signed.push(p.id);
      return { url: "https://private.example/signed" };
    },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.photos, [
    {
      id: photo.id,
      slot: photo.slot,
      uploadedAt: photo.completed_at,
      url: "https://private.example/signed",
    },
  ]);
  assert.deepEqual(signed, [photo.id]);
  assert.equal(urls[0].searchParams.get("created_by"), `eq.${user}`);
  assert.equal(urls[0].searchParams.get("shop_id"), `eq.${shop}`);
  const q = urls[1].searchParams;
  assert.equal(q.get("shop_id"), `eq.${shop}`);
  assert.equal(q.get("record_id"), `eq.${id}`);
  assert.equal(q.get("state"), "eq.current");
  assert.equal(q.get("slot"), "in.(person,idFront)");
  assert.equal(q.get("limit"), "2");
});
test("foreign records cannot list or sign photos, and local-only records return an empty list", async () => {
  let signed = false;
  const signer = async () => {
    signed = true;
    return { url: "secret" };
  };
  const missing = client(() => []);
  const absent = await readAdminRecords(
    missing.admin,
    { action: "record-photos", shopId: shop, userId: user, recordId: id },
    signer,
  );
  assert.equal(absent.status, 404);
  assert.equal(missing.urls.length, 1);
  assert.equal(signed, false);
  const local = client((url) =>
    url.pathname.endsWith("records") ? [{ snapshot }] : [],
  );
  const empty = await readAdminRecords(
    local.admin,
    { action: "record-photos", shopId: shop, recordId: id },
    signer,
  );
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.photos, []);
  assert.equal(signed, false);
});
test("signing failures return actionable errors without leaking storage credentials or partial URLs", async () => {
  const { admin } = client((url) =>
    url.pathname.endsWith("records")
      ? [{ snapshot }]
      : [{ id: "photo", slot: "person" }],
  );
  const result = await readAdminRecords(
    admin,
    { action: "record-photos", shopId: shop, recordId: id },
    async () => {
      throw new Error("private signing credential");
    },
  );
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result), /private signing credential|url/);
});
