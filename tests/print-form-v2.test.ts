import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Transaction,
} from "../src/domain/models";
import { exportFormHtml, exportLanguage } from "../src/domain/form-export";
import { formHtml } from "../src/domain/print-template";

const record: Transaction = {
  id: "record-test",
  reference: "MR-TEST",
  shopId: "shop-test",
  createdBy: "staff-test",
  direction: "buy",
  customerId: "customer-test",
  customer: { ...emptyPerson(), name: "مشتری", idNumber: "1403-1234-12345" },
  shop: { ...emptyShop(), shopName: "دوکان" },
  phone: { ...emptyPhone(), model: "Example", imei1: "490154203237518" },
  price: "12000",
  currency: "AFN",
  occurredAt: "2026-10-06T10:00:00Z",
  templateVersion: "draft-v1",
  syncState: "synced",
};
const jpeg = "data:image/jpeg;base64,/9j/AA==";

test("exports default to the Pashto form regardless of app language", () => {
  for (const language of ["ps", "fa", "en"] as const) {
    assert.equal(exportLanguage(language), "ps");
    const html = exportFormHtml(record, language, "", false);
    assert.ok(html.includes('lang="ps" dir="rtl"'));
    assert.ok(html.includes('data-template="pashto-v2"'));
    assert.ok(html.includes("د پلورونکي اقرار"));
    assert.ok(!html.includes("DRAFT") && !html.includes("pending a legible"));
    assert.ok(html.includes("14:30")); // Kabul, not device timezone.
    assert.ok(html.includes("14 تله 1405"));
    assert.ok(!html.includes("د IMEI دویمه شمېره"));
  }
});

test("purchase and sale map customer and shop roles correctly", () => {
  for (const direction of ["buy", "sell"] as const) {
    const html = exportFormHtml(
      { ...record, direction },
      "en",
      "",
      false,
      undefined,
      { person: jpeg, idFront: jpeg },
    );
    const customerRole = direction === "buy" ? "پلورونکي" : "پېرودونکي";
    const shopRole = direction === "buy" ? "پېرودونکي" : "پلورونکي";
    assert.ok(html.includes(`د ${customerRole} پېژندنه · مشتری`));
    assert.ok(html.includes(`د ${shopRole} پېژندنه · دوکاندار`));
    assert.ok(html.includes(`د ${customerRole} عکس`));
    assert.equal((html.match(/<img /g) ?? []).length, 2);
  }
});

test("biometric panel appears only for a confirmed enrollment and uses a symbol", () => {
  for (const enrolled of [undefined, false, true]) {
    const html = exportFormHtml(record, "ps", "", false, undefined, {
      fingerprintEnrolled: enrolled,
    });
    assert.equal(html.includes('data-biometric="enrolled"'), enrolled === true);
    assert.equal(html.includes("<svg"), enrolled === true);
    assert.equal(html.includes("بایومټریک ثبت شوی"), enrolled === true);
    assert.ok(html.includes("د پلورونکي لاسلیک / د ګوتې نښه"));
    if (enrolled) assert.ok(html.includes("دا سمبول دی، اصلي ګوته نه ده"));
  }
});

test("images are embedded JPEGs only and record text is escaped", () => {
  const unsafe = '<script>alert("test")</script>';
  const html = exportFormHtml(
    { ...record, customer: { ...record.customer, name: unsafe } },
    "ps",
    "",
    false,
    unsafe,
    {
      person: "https://example.com/private.jpg",
      idFront: `${jpeg}" onerror="alert(1)`,
    },
  );
  assert.ok(!html.includes("<img "));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal((html.match(/عکس نشته/g) ?? []).length, 2);
});

test("legacy layout remains accessible and neither export rewrites snapshots", () => {
  const before = JSON.stringify(record);
  const attachments = { person: jpeg, fingerprintEnrolled: true };
  for (const language of ["ps", "fa", "en"] as const) {
    assert.equal(exportLanguage(language, true), language);
    assert.equal(
      exportFormHtml(record, language, "", true, undefined, attachments, true),
      formHtml(record, language, "", true, undefined, attachments),
    );
    exportFormHtml(record, language, "", true, undefined, attachments);
  }
  assert.equal(JSON.stringify(record), before);
});

test("paper ID, dual IMEI, and long details remain present in the document", () => {
  const address = "د مشتری بشپړ ادرس ".repeat(60) + "END-ADDRESS";
  const html = exportFormHtml(
    {
      ...record,
      customer: {
        ...record.customer,
        idType: "pnid",
        idVolume: "12",
        idPage: "45",
        currentAddress: address,
      },
      phone: {
        ...record.phone,
        imei2: "356938035643809",
        notes: "LONG-NOTE ".repeat(80),
      },
    },
    "ps",
    "",
    false,
  );
  for (const text of [
    "کاغذي تذکره",
    "12 / 45",
    "END-ADDRESS",
    "356938035643809",
    "LONG-NOTE",
  ])
    assert.ok(html.includes(text));
  assert.ok(!html.includes("overflow:hidden"));
});
