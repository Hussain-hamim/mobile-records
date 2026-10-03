import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractPrintedPerson,
  mergeScanFields,
} from "../src/domain/printed-id";
import { emptyPerson } from "../src/domain/models";

test("printed English card fields are extracted independently, including DOB and relatives", () => {
  assert.deepEqual(
    extractPrintedPerson(
      `Full name: Test Example
Father's name: Parent Example
Grandfather's name: Elder Example
Date of birth: 01/02/1999
Sex: Female
Nationality: Afghan
Permanent address: Kabul
Current address: Herat
Occupation: Teacher
Phone: 0700123456`,
      "en",
    ),
    {
      name: "Test Example",
      fatherName: "Parent Example",
      grandfatherName: "Elder Example",
      dateOfBirth: "01/02/1999",
      gender: "F",
      nationality: "AFG",
      originalAddress: "Kabul",
      currentAddress: "Herat",
      occupation: "Teacher",
      phone: "0700123456",
    },
  );
});

test("Dari and Pashto labels, Arabic letter variants and English digits", () => {
  assert.deepEqual(
    extractPrintedPerson(
      `نام پدر: احمد
د نیکه نوم: محمود
تاریخ تولد: ۱۳۷۸/۰۱/۱۲
جنسیت: مرد
تابعيت: افغان
شماره تذکره: ۱۳۹۹-۱۲۳۴-۰۰۱۲۳
سکونت اصلی: کابل
اوسنی استوګنځی: هرات
جلد: ۲
صفحه: ٣`,
      "fa",
    ),
    {
      fatherName: "احمد",
      grandfatherName: "محمود",
      dateOfBirth: "1378/01/12",
      gender: "M",
      nationality: "AFG",
      idNumber: "1399-1234-00123",
      originalAddress: "کابل",
      currentAddress: "هرات",
      idVolume: "2",
      idPage: "3",
    },
  );
});

test("label/value on adjacent lines or in RTL order is supported", () => {
  assert.deepEqual(
    extractPrintedPerson("نام پدر\nاحمد\nمحمود : د نیکه نوم", "ps"),
    {
      fatherName: "احمد",
      grandfatherName: "محمود",
    },
  );
});

test("bilingual slash-separated labels identify the same field", () => {
  assert.deepEqual(
    extractPrintedPerson(
      "نام / نوم: احمد\nFather's name / نام پدر: محمود",
      "ps",
    ),
    {
      name: "احمد",
      fatherName: "محمود",
    },
  );
});

test("unlabelled text, incomplete dates, digits in names and missing values are omitted", () => {
  assert.deepEqual(
    extractPrintedPerson(
      `Islamic Republic of Afghanistan
TEST EXAMPLE
Place of birth: Kabul
Father's name: 123
Grandfather's name:
Date of birth: 01/01/99
Phone: 12
I<AFG13991234<600123<<<<<<<<<<`,
      "en",
    ),
    {},
  );
});

test("conflicting values stay blank; bilingual values use the chosen script", () => {
  assert.deepEqual(
    extractPrintedPerson("Father's name: First\nFather's name: Second", "en"),
    {},
  );
  const text = "Father's name: Ahmad\nنام پدر: احمد";
  assert.deepEqual(extractPrintedPerson(text, "en"), { fatherName: "Ahmad" });
  assert.deepEqual(extractPrintedPerson(text, "ps"), { fatherName: "احمد" });
});

test("second-side scan preserves reviewed fields and IDs, and fills only missing values", () => {
  const current = {
    ...emptyPerson(),
    name: "MRZ NAME",
    idNumber: "1399-1234-00123",
    fatherName: "Reviewed",
  };
  const merged = mergeScanFields(current, {
    name: "Noisy OCR",
    idNumber: "999",
    fatherName: "Another",
    grandfatherName: "Elder",
    dateOfBirth: "1999-01-01",
  });
  assert.equal(merged.name, current.name);
  assert.equal(merged.idNumber, current.idNumber);
  assert.equal(merged.fatherName, "Reviewed");
  assert.equal(merged.grandfatherName, "Elder");
  assert.equal(merged.dateOfBirth, "1999-01-01");
  assert.equal(current.grandfatherName, "");
});
