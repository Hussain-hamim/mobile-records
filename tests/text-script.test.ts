import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasArabicText,
  inputTypography,
  textRuns,
} from "../src/domain/text-script";

test("mixed labels keep English names and normalized numbers out of local font runs", () => {
  const runs = textRuns("نوم: Ahmad Khan · Samsung A۵۵ — ٢٤,۵۰۰ AFN");
  assert.equal(
    runs.map((run) => run.text).join(""),
    "نوم: Ahmad Khan · Samsung A55 — 24,500 AFN",
  );
  assert.deepEqual(
    runs.filter((run) => run.local).map((run) => run.text),
    ["نوم"],
  );
});

test("Arabic shaping retains vowel marks and joining characters", () => {
  assert.deepEqual(textRuns("مُحَمَّد"), [{ text: "مُحَمَّد", local: true }]);
  assert.deepEqual(textRuns("می\u200cشود"), [
    { text: "می\u200cشود", local: true },
  ]);
});

for (const language of ["en", "ps", "fa"] as const) {
  test(`${language}: English and numeric input uses the same system font`, () => {
    for (const value of [
      "Radefy MobileReg",
      "José Khan",
      "+۹۳ ۷۰۰ ۱۲۳ ۴۵۶",
      "IMEI ٢",
      "",
    ]) {
      assert.deepEqual(inputTypography(value, language), {
        fontFamily: undefined,
        writingDirection: "ltr",
      });
    }
    // TextInput has one font: preserve system Latin/digits in mixed input too.
    assert.equal(
      inputTypography("کابل Kabul 24", language).fontFamily,
      undefined,
    );
    assert.equal(inputTypography("کابل ۲۴", language).fontFamily, undefined);
  });
}

test("local-script-only inputs use the appropriate custom font", () => {
  assert.equal(inputTypography("کابل", "ps").fontFamily, "BahijBaraem");
  assert.equal(inputTypography("کابل", "fa").fontFamily, "Noto");
  assert.equal(hasArabicText("۱۲۳"), false);
  assert.equal(hasArabicText("Kabul"), false);
  assert.equal(hasArabicText("کابل"), true);
});
