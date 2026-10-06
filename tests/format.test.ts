import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAuditDate,
  formatDate,
  formatMoney,
  localDay,
} from "../src/domain/format";
import { translate, type TextKey } from "../src/i18n/strings";

for (const language of ["en", "ps", "fa"] as const) {
  test(`${language}: audit timestamps keep Western digits in both calendars`, () => {
    for (const gregorian of [true, false]) {
      const stamp = formatAuditDate(
        "2026-10-01T12:00:00Z",
        language,
        gregorian,
      );
      assert.match(stamp, /16:30:00/);
      assert.doesNotMatch(stamp, /[۰-۹٠-٩]/);
    }
  });
  test(`${language}: money uses English digits and separators`, () => {
    assert.equal(formatMoney(24500.75, language), "24,500.75 AFN");
    assert.equal(formatMoney("۲۴۵۰۰.۷۵", language), "24,500.75 AFN");
    assert.equal(formatMoney("٢٤٥٠٠", language), "24,500 AFN");
  });

  test(`${language}: both calendars use English digits`, () => {
    const date = "2026-10-01T12:00:00Z";
    const solar = formatDate(date, language);
    const gregorian = formatDate(date, language, true);
    assert.match(solar, /1405/);
    assert.match(gregorian, /2026/);
    assert.doesNotMatch(solar + gregorian, /[۰-۹٠-٩]/);
    if (language !== "en") assert.match(gregorian, /[\u0600-\u06ff]/);
  });

  test(`${language}: numbered translations use English digits`, () => {
    for (const key of [
      "imei1",
      "imei2",
      "invalidImei",
      "invalidSecondImei",
    ] satisfies TextKey[]) {
      const text = translate(language, key);
      assert.match(text, /[0-9]/);
      assert.doesNotMatch(text, /[۰-۹٠-٩]/);
    }
  });
}

test("local day keeps English digits and the Kabul timezone boundary", () => {
  assert.equal(localDay("2026-10-01T20:00:00Z"), "2026-10-02");
});
