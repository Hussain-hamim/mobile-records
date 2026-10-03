import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyPhone } from "../src/domain/models";
import {
  resolvePhoneSuggestions,
  applyPhoneSuggestions,
} from "../src/domain/phone-lookup";
const imei = "490154203237518";

test("scanned IMEI normalizes digits and gets only brand/model from TAC", async () => {
  let requested = "";
  const found = await resolvePhoneSuggestions(
    "۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸",
    [],
    async (value) => {
      requested = value;
      return { brand: "Example", model: "Phone" };
    },
  );
  assert.equal(requested, imei);
  assert.deepEqual(found, { brand: "Example", model: "Phone" });
  const baseline = emptyPhone(),
    current = { ...baseline, imei1: imei };
  const filled = applyPhoneSuggestions(
    current,
    baseline,
    found!,
    "imei1",
    imei,
  );
  assert.equal(filled.brand, "Example");
  assert.equal(filled.model, "Phone");
  assert.equal(filled.storage, "");
  assert.equal(filled.imei1, imei);
});

test("latest exact match in either IMEI slot reuses saved specifications, never condition or notes", async () => {
  const saved = {
    ...emptyPhone(),
    brand: "Example",
    model: "Known",
    color: "Blue",
    storage: "256 GB",
    ram: "8 GB",
    simCount: "2",
    imei2: imei,
    condition: "Used",
    notes: "Old damage",
  };
  const records = [
    { phone: saved, occurredAt: "2026-10-03T10:00:00Z" },
    { phone: { ...saved, color: "Black" }, occurredAt: "2026-10-01T10:00:00Z" },
  ];
  const result = await resolvePhoneSuggestions(imei, records, async () => {
    throw Error("TAC must not replace confirmed exact match");
  });
  assert.deepEqual(result, {
    brand: "Example",
    model: "Known",
    color: "Blue",
    storage: "256 GB",
    ram: "8 GB",
    simCount: "2",
  });
  const baseline = {
    ...emptyPhone(),
    imei1: imei,
    notes: "Today",
    condition: "New assessment",
  };
  const applied = applyPhoneSuggestions(
    baseline,
    baseline,
    result!,
    "imei1",
    imei,
  );
  assert.equal(applied.simCount, "2");
  assert.equal(applied.notes, "Today");
  assert.equal(applied.condition, "New assessment");
  assert.equal(applied.imei2, "");
});

test("late lookup results cannot overwrite a changed IMEI or fields edited while waiting", async () => {
  const baseline = { ...emptyPhone(), imei1: imei };
  const edited = { ...baseline, brand: "Manual brand" };
  assert.equal(
    applyPhoneSuggestions(
      edited,
      baseline,
      { brand: "Suggestion", model: "New model" },
      "imei1",
      imei,
    ).brand,
    "Manual brand",
  );
  const changed = { ...edited, imei1: "356938035643809" };
  assert.equal(
    applyPhoneSuggestions(
      changed,
      baseline,
      { model: "Old result" },
      "imei1",
      imei,
    ),
    changed,
  );
  const second = { ...baseline, imei2: imei, brand: "Primary brand" };
  const applied = applyPhoneSuggestions(
    second,
    second,
    { brand: "Other", model: "Gap filled" },
    "imei2",
    imei,
  );
  assert.equal(applied.brand, "Primary brand");
  assert.equal(applied.model, "Gap filled");
});

test("unknown IMEI stays manual and invalid input never queries TAC", async () => {
  assert.equal(await resolvePhoneSuggestions(imei, [], async () => null), null);
  await assert.rejects(
    resolvePhoneSuggestions("123", [], async () => {
      throw Error("unexpected lookup");
    }),
    /invalidImei/,
  );
});
