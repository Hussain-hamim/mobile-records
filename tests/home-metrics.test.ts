import assert from "node:assert/strict";
import { test } from "node:test";
import { homeMetrics } from "../src/domain/home-metrics";
import {
  emptyPerson,
  emptyPhone,
  emptyShop,
  type Transaction,
  type Amendment,
} from "../src/domain/models";
function record(
  id: string,
  occurredAt: string,
  direction: "buy" | "sell" = "buy",
  price = "100",
): Transaction {
  return {
    id,
    reference: id,
    shopId: "shop",
    createdBy: "staff",
    direction,
    phone: emptyPhone(),
    customer: emptyPerson(),
    customerId: "customer",
    shop: emptyShop(),
    price,
    currency: "AFN",
    occurredAt,
    templateVersion: "draft-v1",
    syncState: "synced",
  };
}
test("home metrics use Kabul midnight and Saturday-start weeks, excluding future records", () => {
  const now = new Date("2026-10-04T08:00:00Z");
  const rows = [
    record("today", "2026-10-03T19:30:00Z", "sell", "25"),
    record("yesterday", "2026-10-03T19:29:59Z"),
    record("sat", "2026-10-02T19:30:00Z"),
    record("fri", "2026-10-02T19:29:59Z"),
    record("future", "2026-10-04T08:00:01Z"),
  ];
  const metrics = homeMetrics(rows, [], now, true);
  assert.equal(metrics.today.count, 1);
  assert.equal(metrics.today.saleTotal, 25);
  assert.equal(metrics.thisWeek.count, 3);
  assert.equal(metrics.thisWeek.purchaseTotal, 200);
  assert.equal(metrics.thisMonth.count, 4);
  assert.equal(metrics.today.start, "2026-10-03T19:30:00.000Z");
  assert.equal(metrics.thisWeek.start, "2026-10-02T19:30:00.000Z");
});
test("Solar Hijri and Gregorian month boundaries follow the calendar setting", () => {
  const now = new Date("2024-03-20T12:00:00Z");
  const rows = [
    record("newyear", "2024-03-19T19:30:00Z"),
    record("oldyear", "2024-03-19T19:29:59Z"),
  ];
  const solar = homeMetrics(rows, [], now);
  assert.equal(solar.thisMonth.count, 1);
  assert.equal(solar.thisMonth.start, "2024-03-19T19:30:00.000Z");
  assert.equal(homeMetrics(rows, [], now, true).thisMonth.count, 2);
});
test("latest corrections replace originals once; amounts normalize local digits and avoid decimal drift", () => {
  const now = new Date("2026-10-04T08:00:00Z");
  const original = record("1", now.toISOString(), "buy", "100");
  const amend = (id: string, createdAt: string, price: string): Amendment => ({
    id,
    recordId: "1",
    snapshot: { ...original, direction: "sell", price },
    createdAt,
    createdBy: "owner",
    reason: "Correction",
    syncState: "synced",
  });
  const result = homeMetrics(
    [original, original, record("2", now.toISOString(), "sell", "0.1")],
    [
      amend("latest", "2026-10-04T07:00:00Z", "۰.۲"),
      amend("older", "2026-10-04T06:00:00Z", "999"),
    ],
    now,
  ).today;
  assert.equal(result.count, 2);
  assert.equal(result.purchases, 0);
  assert.equal(result.sales, 2);
  assert.equal(result.saleTotal, 0.3);
});
test("empty periods show zero; invalid dates and amounts do not poison totals", () => {
  const now = new Date("2026-10-04T08:00:00Z");
  const result = homeMetrics(
    [record("date", "bad"), record("amount", now.toISOString(), "sell", "bad")],
    [],
    now,
  );
  for (const period of Object.values(result)) {
    assert.equal(period.count, 0);
    assert.equal(period.saleTotal, 0);
    assert.equal(period.purchaseTotal, 0);
  }
});

test("voided transactions are excluded and photo authorization does not override a correction", () => {
 const now=new Date("2026-10-04T08:00:00Z"), original=record("r",now.toISOString(),"buy","100");
 const correction: Amendment={id:"a",recordId:"r",snapshot:{...original,price:"200"},reason:"Corrected",createdBy:"owner",createdAt:"2026-10-04T07:00:00Z",syncState:"synced",kind:"correction"};
 const photo: Amendment={...correction,id:"b",kind:"photo",snapshot:original,createdAt:"2026-10-04T07:01:00Z"};
 assert.equal(homeMetrics([original],[correction,photo],now).today.purchaseTotal,200);
 assert.equal(homeMetrics([original],[correction,photo,{...photo,id:"c",kind:"void"}],now).today.count,0);
});
