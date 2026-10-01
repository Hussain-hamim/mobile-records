import { test } from "node:test";
import assert from "node:assert/strict";
import { mrzCheckDigit, readAfghanMrz } from "../src/domain/mrz";

// Synthetic people and IDs only. Never commit a customer's MRZ or ID image.
const lines = [
  "I<AFG13991234<600123<<<<<<<<<<",
  "9901018F3001019AFG<<<<<<<<<<<0",
  "EXAMPLE<<TEST<PERSON<<<<<<<<<<",
];
const text = lines.join("\n");
const expected = {
  ok: true,
  fields: { name: "TEST PERSON EXAMPLE", idNumber: "1399-1234-00123" },
};
const replaceAt = (value: string, index: number, char: string) =>
  value.slice(0, index) + char + value.slice(index + 1);

test("ICAO reference check digits include letter values, fillers and 7/3/1 weights", () => {
  assert.equal(mrzCheckDigit("D23145890"), "7");
  assert.equal(mrzCheckDigit("740812"), "2");
  assert.equal(mrzCheckDigit("120415"), "9");
  assert.equal(
    mrzCheckDigit("D231458907<<<<<<<<<<<<<<<74081221204159<<<<<<<<<<<"),
    "6",
  );
  assert.throws(() => mrzCheckDigit("12!"));
});

test("Afghan split ID reconstructs all 13 digits, retaining leading zeroes", () => {
  assert.deepEqual(readAfghanMrz([text]), expected);
  assert.deepEqual(
    readAfghanMrz([
      "National Identity Card\nID Number: 1111111111111\n" + text + "\nfooter",
    ]),
    expected,
  );
  assert.deepEqual(
    readAfghanMrz([
      lines.map((s) => s.toLowerCase().split("").join(" ")).join("\r\n"),
    ]),
    expected,
  );
  assert.deepEqual(readAfghanMrz([text, text]), expected);
});

test("standard extended TD1 document number validates its own check digit", () => {
  const extended = [
    "I<AFG139912340<01232<<<<<<<<<<",
    "9901018F3001019AFG<<<<<<<<<<<8",
    lines[2],
  ];
  assert.deepEqual(readAfghanMrz([extended.join("\n")]), expected);
  extended[0] = replaceAt(extended[0], 19, "3");
  assert.equal(readAfghanMrz([extended.join("\n")]).ok, false);
});

test("every single numeric change in protected fields is rejected", () => {
  for (const row of [0, 1]) {
    for (let col = 0; col < 30; col++) {
      if (!/\d/.test(lines[row][col])) continue;
      const changed = [...lines];
      changed[row] = replaceAt(
        changed[row],
        col,
        String((Number(changed[row][col]) + 1) % 10),
      );
      assert.equal(
        readAfghanMrz([changed.join("\n")]).ok,
        false,
        `row ${row}, col ${col}`,
      );
    }
  }
});

test("individual checks are enforced even when the composite check is consistent", () => {
  for (const [row, col] of [
    [0, 14],
    [1, 6],
    [1, 14],
  ]) {
    const changed = [...lines];
    changed[row] = replaceAt(
      changed[row],
      col,
      String((Number(changed[row][col]) + 1) % 10),
    );
    const [a, b] = changed;
    changed[1] =
      b.slice(0, 29) +
      mrzCheckDigit(
        a.slice(5) + b.slice(0, 7) + b.slice(8, 15) + b.slice(18, 29),
      );
    assert.deepEqual(readAfghanMrz([changed.join("\n")]), {
      ok: false,
      error: "mrzInvalid",
    });
  }
});

test("impossible dates are rejected even with matching checksums", () => {
  for (const date of ["991301", "990230", "990000"]) {
    const b = date + mrzCheckDigit(date) + lines[1].slice(7, 29);
    const composite = mrzCheckDigit(
      lines[0].slice(5) + b.slice(0, 7) + b.slice(8, 15) + b.slice(18, 29),
    );
    assert.deepEqual(
      readAfghanMrz([[lines[0], b + composite, lines[2]].join("\n")]),
      { ok: false, error: "mrzInvalid" },
    );
  }
});

test("missing lines, fillers, invalid glyphs and front-only text never autofill", () => {
  for (const invalid of [
    "",
    "Name: Test Person\nID Number: 1399-1234-00123",
    lines.slice(0, 2).join("\n"),
    text.replace("1399", "I399"),
    text.replace("EXAMPLE", "EXAMP1E"),
    text.replace("00123", "OO123"),
    lines.map((line) => line.slice(0, 29)).join("\n"),
    text.replace("EXAMPLE<<", "EXAMPLE?<"),
    text.replace("I<AFG", "I<UTO"),
  ])
    assert.equal(readAfghanMrz([invalid]).ok, false);
  assert.deepEqual(readAfghanMrz([text.replace("I<AFG", "I<UTO")]), {
    ok: false,
    error: "mrzUnsupported",
  });
});

test("unknown optional-data layout never turns into a truncated tazkira number", () => {
  // Valid ICAO example, with AFG issuer/nationality (not part of the checksum).
  assert.deepEqual(
    readAfghanMrz([
      "I<AFGD231458907<<<<<<<<<<<<<<<\n7408122F1204159AFG<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<",
    ]),
    { ok: false, error: "mrzUnsupported" },
  );
});

test("conflicting names require a retake even when numeric checks pass", () => {
  const second = text.replace("TEST<PERSON", "SOME<PERSON");
  assert.deepEqual(readAfghanMrz([text, second]), {
    ok: false,
    error: "mrzAmbiguous",
  });
  assert.deepEqual(readAfghanMrz([text + "\n" + second]), {
    ok: false,
    error: "mrzAmbiguous",
  });
});

test("only name and ID are returned, never raw MRZ, dates or inferred relatives/address", () => {
  const result = readAfghanMrz([text]);
  assert.deepEqual(result, expected);
  assert.equal(JSON.stringify(result).includes("990101"), false);
  assert.equal(JSON.stringify(result).includes("I<AFG"), false);
});
