import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyPerson } from "../src/domain/models";
import {
  validCorners,
  defaultCorners,
  mergeCandidates,
  documentCandidates,
  consolidateCandidates,
  mrzBand,
  type ScanCandidate,
  type OcrWord,
} from "../src/domain/tazkira";
const candidate = (
  key: ScanCandidate["key"],
  value: string,
): ScanCandidate => ({
  key,
  value,
  confidence: 90,
  source: "offline",
  mrzChecked: false,
});
test("perspective selection rejects crossed, tiny, non-finite and out-of-image quadrilaterals", () => {
  assert.equal(validCorners(defaultCorners()), true);
  assert.equal(
    validCorners([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.1 },
      { x: 0.9, y: 0.8 },
      { x: 0.2, y: 0.9 },
    ]),
    true,
  );
  const crossed = defaultCorners();
  [crossed[1], crossed[2]] = [crossed[2], crossed[1]];
  assert.equal(validCorners(crossed), false);
  for (const x of [NaN, -1, 2]) {
    const points = defaultCorners();
    points[0].x = x;
    assert.equal(validCorners(points), false);
  }
  assert.equal(
    validCorners([
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.01, y: 0.01 },
      { x: 0, y: 0.01 },
    ]),
    false,
  );
});
test("readable fields survive poor words elsewhere and use English digits", () => {
  const words: OcrWord[] = [
    {
      text: "Name: TEST EXAMPLE",
      line: 1,
      confidence: 95,
      box: [0, 0, 300, 30],
    },
    {
      text: "ID number: ۱۲۳۴۵۶۷۸۹۰۱۲۳",
      line: 2,
      confidence: 90,
      box: [0, 40, 300, 70],
    },
    {
      text: "Father name: BAD READ",
      line: 3,
      confidence: 10,
      box: [0, 90, 300, 120],
    },
  ];
  const result = documentCandidates(
    { text: "", words, width: 1000, height: 500 },
    "en",
    "offline",
  );
  assert.equal(result.find((c) => c.key === "name")?.value, "TEST EXAMPLE");
  assert.equal(
    result.find((c) => c.key === "idNumber")?.value,
    "1234567890123",
  );
  assert.ok(!result.some((c) => c.key === "fatherName"));
});
test("geometry associates labels with values in their own column", () => {
  const words: OcrWord[] = [
    { text: "Father name", line: 1, confidence: 95, box: [0, 0, 150, 20] },
    {
      text: "Grandfather name",
      line: 2,
      confidence: 95,
      box: [500, 0, 700, 20],
    },
    { text: "PARENT EXAMPLE", line: 3, confidence: 95, box: [0, 25, 200, 45] },
    { text: "ELDER EXAMPLE", line: 4, confidence: 95, box: [500, 25, 700, 45] },
  ];
  const result = documentCandidates(
    { text: "", words, width: 1000, height: 500 },
    "en",
    "offline",
  );
  assert.equal(
    result.find((c) => c.key === "fatherName")?.value,
    "PARENT EXAMPLE",
  );
  assert.equal(
    result.find((c) => c.key === "grandfatherName")?.value,
    "ELDER EXAMPLE",
  );
});
test("manual values survive, missing values fill and conflicts remain visible", () => {
  const current = { ...emptyPerson(), name: "MY EDIT" };
  const result = mergeCandidates(current, [
    candidate("name", "OCR NAME"),
    candidate("fatherName", "PARENT"),
  ]);
  assert.equal(result.fields.name, "MY EDIT");
  assert.equal(result.fields.fatherName, "PARENT");
  assert.equal(result.conflicts.length, 1);
  const ambiguous = mergeCandidates(emptyPerson(), [
    candidate("name", "ONE"),
    candidate("name", "TWO"),
  ]);
  assert.equal(ambiguous.fields.name, "");
  assert.equal(ambiguous.conflicts.length, 2);
});
test("conflicting IDs block all fields from the new side", () => {
  const current = { ...emptyPerson(), idNumber: "0000-1234-56789" };
  const result = mergeCandidates(current, [
    candidate("idNumber", "9999-1234-56789"),
    candidate("fatherName", "WRONG CARD"),
  ]);
  assert.equal(result.identityMismatch, true);
  assert.deepEqual(result.fields, current);
  assert.equal(
    mergeCandidates(current, [candidate("idNumber", "۰۰۰۰۱۲۳۴۵۶۷۸۹")])
      .identityMismatch,
    false,
  );
});
test("script preference keeps Dari names while checksummed ID wins", () => {
  const result = consolidateCandidates(
    [
      candidate("name", "نام نمونه"),
      { ...candidate("name", "EXAMPLE"), mrzChecked: true },
      candidate("idNumber", "123"),
      { ...candidate("idNumber", "456"), mrzChecked: true },
    ],
    "fa",
  );
  assert.equal(result.find((c) => c.key === "name")?.value, "نام نمونه");
  assert.equal(result.find((c) => c.key === "idNumber")?.value, "456");
});
test("MRZ search remains within the confirmed card", () => {
  const doc = { text: "", words: [], width: 1000, height: 600 };
  assert.deepEqual(mrzBand(doc), [0, 0.55, 1, 0.45]);
  const band = mrzBand({
    ...doc,
    words: [
      {
        text: "I<AFG<<<<",
        confidence: 90,
        line: 1,
        box: [0, 500, 1000, 600],
      } as OcrWord,
    ],
  });
  assert.equal(band[0], 0);
  assert.equal(band[2], 1);
  assert.ok(band[1] + band[3] <= 1);
});

test("large gaps split bilingual columns even when the engine returns one line", () => {
  const words: OcrWord[] = [
    { text: "Name:", line: 1, confidence: 95, box: [0, 0, 60, 20] },
    { text: "TEST", line: 1, confidence: 95, box: [70, 0, 130, 20] },
    { text: "EXAMPLE", line: 1, confidence: 95, box: [140, 0, 230, 20] },
    { text: "نام:", line: 1, confidence: 95, box: [700, 0, 760, 20] },
    { text: "نمونه", line: 1, confidence: 95, box: [620, 0, 690, 20] },
  ];
  const doc = { text: "", words, width: 1000, height: 500 };
  assert.equal(
    documentCandidates(doc, "en", "offline").find((c) => c.key === "name")
      ?.value,
    "TEST EXAMPLE",
  );
  assert.equal(
    documentCandidates(doc, "fa", "offline").find((c) => c.key === "name")
      ?.value,
    "نمونه",
  );
});

test("a solitary MRZ-like fragment does not cut off the unread lines", () => {
  assert.deepEqual(
    mrzBand({
      text: "",
      width: 1000,
      height: 600,
      words: [
        { text: "I<AFG", confidence: 90, line: 1, box: [50, 300, 950, 330] },
      ],
    }),
    [0, 0.47, 1, 0.53],
  );
});
