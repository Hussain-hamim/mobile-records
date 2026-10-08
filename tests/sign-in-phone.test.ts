import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPhoneCountries,
  phoneCountries,
  signInPhoneNumber,
  updateSignInPhone,
  type SignInPhone,
} from "../src/domain/sign-in-phone";

test("Afghan local numbers with or without a trunk zero reach the same account", () => {
  for (const number of [
    "700123456",
    "0700 123 456",
    "۷۰۰۱۲۳۴۵۶",
    "٠٧٠٠١٢٣٤٥٦",
  ]) {
    assert.equal(signInPhoneNumber({ country: "AF", number }), "+93700123456");
  }
});

test("international selection respects national prefixes and significant zeros", () => {
  const cases: [SignInPhone, string][] = [
    [{ country: "PK", number: "0300 1234567" }, "+923001234567"],
    [{ country: "GB", number: "07700 900123" }, "+447700900123"],
    [{ country: "IT", number: "02 36618 300" }, "+390236618300"],
    [{ country: "US", number: "(202) 555-0123" }, "+12025550123"],
    [{ country: "CA", number: "4165550123" }, "+14165550123"],
  ];
  for (const [value, expected] of cases)
    assert.equal(signInPhoneNumber(value), expected);
});

test("pasting a full number updates the country without duplicating its code", () => {
  for (const number of [
    "+44 7700 900123",
    "0044 7700 900123",
    "+۴۴ ۷۷۰۰ ۹۰۰۱۲۳",
  ]) {
    const value = updateSignInPhone(number, { country: "AF", number: "" });
    assert.deepEqual(value, { country: "GB", number: "7700900123" });
    assert.equal(signInPhoneNumber(value), "+447700900123");
  }
  assert.equal(
    updateSignInPhone("+1 416 555 0123", { country: "US", number: "" }).country,
    "CA",
  );
});

test("partial input remains editable without guessing a new country", () => {
  for (const number of ["", "+", "+44", "00", "۷۰۰"]) {
    const value = updateSignInPhone(number, { country: "AF", number: "" });
    assert.equal(value.country, "AF");
  }
});

test("blank, short, invalid, extension and mismatched-country values are rejected", () => {
  for (const number of [
    "",
    "+93",
    "123",
    "call 0700123456",
    "+93700123456 ext 2",
    "+44 7700900123",
    "9".repeat(25),
  ]) {
    assert.throws(
      () => signInPhoneNumber({ country: "AF", number }),
      /invalidPhone/,
    );
  }
});

test("country list covers shared codes, localized search and Western dialing digits", () => {
  assert.ok(phoneCountries.length >= 240);
  assert.equal(
    new Set(phoneCountries.map((country) => country.code)).size,
    phoneCountries.length,
  );
  for (const country of phoneCountries) {
    assert.ok(country.en && country.ps && country.fa && country.flag);
    assert.match(country.dialCode, /^\+\d+$/);
  }
  assert.equal(findPhoneCountries("Afghanistan", "fa")[0]?.code, "AF");
  assert.equal(findPhoneCountries("+۹۳", "ps")[0]?.code, "AF");
  assert.equal(findPhoneCountries("افغانستان", "en")[0]?.code, "AF");
  assert.ok(
    findPhoneCountries("+1", "en").some((country) => country.code === "CA"),
  );
  assert.ok(
    findPhoneCountries("+1", "en").some((country) => country.code === "US"),
  );
  assert.deepEqual(findPhoneCountries("no-such-country", "en"), []);
});
