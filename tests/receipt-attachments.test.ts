import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Transaction,
} from "../src/domain/models";
import { formHtml } from "../src/domain/print-template";
import {
  loadReceiptAttachments,
  receiptImage,
} from "../src/domain/receipt-attachments";

const record: Transaction = {
  id: "record-a",
  reference: "MR-TEST",
  shopId: "shop-a",
  createdBy: "staff-a",
  direction: "buy",
  customerId: "customer-a",
  customer: { ...emptyPerson(), name: "Sample customer" },
  shop: { ...emptyShop(), shopName: "Sample shop" },
  phone: emptyPhone(),
  price: "100",
  currency: "AFN",
  occurredAt: "2026-10-04T12:00:00Z",
  templateVersion: "draft-v1",
  syncState: "synced",
};
const context = {
  shopId: "shop-a",
  userId: "staff-a",
  fingerprintEnrolled: true,
};
const jpeg = "data:image/jpeg;base64,/9j/AA==";

test("receipt reads only current photos for this account, shop and record", async () => {
  const uris: string[] = [];
  const result = await loadReceiptAttachments(
    record,
    context,
    async (scope) => {
      assert.deepEqual(scope, {
        shopId: "shop-a",
        userId: "staff-a",
        recordId: "record-a",
      });
      return {
        photos: { person: "file://person.jpg", idFront: "file://id.jpg" },
        sources: { person: "file://original.jpg" },
      };
    },
    async (uri) => {
      uris.push(uri);
      return jpeg;
    },
  );
  assert.deepEqual(uris, ["file://person.jpg", "file://id.jpg"]);
  assert.deepEqual(result, {
    person: jpeg,
    idFront: jpeg,
    fingerprintEnrolled: true,
  });
});

test("receipt refuses another shop before accessing any local files", async () => {
  await assert.rejects(
    loadReceiptAttachments(
      record,
      { ...context, shopId: "other" },
      async () => {
        assert.fail("must not load photos");
      },
      async () => jpeg,
    ),
    /scope/,
  );
});

test("unavailable manifests and individual photos do not block printing", async () => {
  const result = await loadReceiptAttachments(
    record,
    context,
    async () => ({ photos: { person: "missing", idFront: "present" } }),
    async (uri) => {
      if (uri === "missing") throw new Error("removed");
      return jpeg;
    },
  );
  assert.equal(result.person, undefined);
  assert.equal(result.idFront, jpeg);
  const missing = await loadReceiptAttachments(
    record,
    context,
    async () => {
      throw new Error("denied");
    },
    async () => jpeg,
  );
  assert.deepEqual(missing, { fingerprintEnrolled: true });
});

test("receipt disallows network paths, SVG and HTML injection as photos", () => {
  for (const value of [
    "https://example.com/id.jpg",
    "file://id.jpg",
    "data:image/svg+xml;base64,AAAA",
    `${jpeg}" onerror="alert(1)`,
  ]) {
    assert.equal(receiptImage(value), undefined);
    const html = formHtml(record, "en", "", true, undefined, { person: value });
    assert.ok(!html.includes("<img "));
  }
});

test("purchase and sale label customer photos by their transaction role", () => {
  for (const direction of ["buy", "sell"] as const) {
    const html = formHtml({ ...record, direction }, "en", "", true, undefined, {
      person: jpeg,
      idFront: jpeg,
      fingerprintEnrolled: true,
    });
    assert.ok(
      html.includes(direction === "buy" ? "Seller photo" : "Buyer photo"),
    );
    assert.equal((html.match(/<img /g) ?? []).length, 2);
    assert.ok(html.includes("object-fit:contain"));
    assert.ok(html.includes("Symbol only"));
    assert.ok(html.includes("Place physical thumbprint here"));
    assert.ok(html.includes("Current enrollment: Enrolled"));
    assert.ok(html.includes("Attachments may differ on reprints"));
    assert.ok(html.includes("attachments-v1"));
  }
});

test("legacy template and snapshot remain unchanged; missing photos and enrollment are explicit", () => {
  const before = JSON.stringify(record);
  const legacy = formHtml(record, "en", "", true);
  assert.ok(!legacy.includes("attachments-v1"));
  for (const language of ["en", "ps", "fa"] as const) {
    const html = formHtml(record, language, "", true, undefined, {});
    assert.ok(html.includes("attachments-v1"));
    assert.ok(!html.includes("<img "));
  }
  const html = formHtml(record, "en", "", true, undefined, {
    fingerprintEnrolled: false,
  });
  assert.ok(html.includes("Not enrolled"));
  assert.ok(html.includes("No photo available on this device"));
  assert.equal(JSON.stringify(record), before);
});
