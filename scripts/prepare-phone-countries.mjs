// Names from the Node.js Intl/CLDR region dataset; codes from libphonenumber-js.
// Regenerate after updating libphonenumber-js: node scripts/prepare-phone-countries.mjs
import { writeFileSync } from "node:fs";
import { getCountries } from "libphonenumber-js/min";

const languages = ["en", "ps", "fa"];
const labels = Object.fromEntries(
  languages.map((language) => [
    language,
    new Intl.DisplayNames(language, { type: "region" }),
  ]),
);
const names = Object.fromEntries(
  getCountries().map((code) => [
    code,
    Object.fromEntries(
      languages.map((language) => [language, labels[language].of(code)]),
    ),
  ]),
);
writeFileSync(
  new URL("../src/domain/phone-country-names.json", import.meta.url),
  JSON.stringify(names, null, 2) + "\n",
);
