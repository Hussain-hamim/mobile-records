import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import names from "./phone-country-names.json";
import metadata from "libphonenumber-js/metadata.min.json";
import type { Language } from "./models";
import { digits, normalizePhone } from "./validation";

export type SignInPhone = { country: CountryCode; number: string };
export type PhoneCountry = {
  code: CountryCode;
  dialCode: string;
  flag: string;
  en: string;
  ps: string;
  fa: string;
};

/** Bundled metadata: selecting a country never needs a network request. */
export const phoneCountries: PhoneCountry[] = getCountries().map((code) => ({
  code,
  dialCode: `+${getCountryCallingCode(code)}`,
  flag: String.fromCodePoint(
    ...Array.from(code, (letter) => 127397 + letter.charCodeAt(0)),
  ),
  ...names[code],
}));

export function findPhoneCountries(
  query: string,
  language: Language,
): PhoneCountry[] {
  const needle = digits(query).trim().toLowerCase();
  return phoneCountries
    .filter((country) =>
      [country.en, country.ps, country.fa, country.code, country.dialCode].some(
        (value) => value.toLowerCase().includes(needle),
      ),
    )
    .sort((a, b) => a[language].localeCompare(b[language]));
}

function internationalInput(value: string) {
  return digits(value).trim().replace(/^00/, "+");
}

/** Recognize complete pasted international numbers without guessing mid-typing. */
export function updateSignInPhone(
  value: string,
  current: SignInPhone,
): SignInPhone {
  const number = digits(value);
  const text = internationalInput(number);
  if (text.startsWith("+") && /^[+\d\s().-]+$/.test(text)) {
    const parsed = parsePhoneNumberFromString(text, { extract: false });
    if (parsed?.isPossible() && !parsed.ext) {
      // Reserved/test numbers may have a valid length without a specific territory.
      // Keep a compatible selection, otherwise use the numbering plan's main country.
      const country =
        parsed.country ??
        (getCountryCallingCode(current.country) === parsed.countryCallingCode
          ? current.country
          : (metadata.country_calling_codes as Record<string, CountryCode[]>)[
              parsed.countryCallingCode
            ]?.[0]);
      if (country && phoneCountries.some((item) => item.code === country)) {
        return { country, number: parsed.nationalNumber };
      }
    }
  }
  return { country: current.country, number };
}

/** Respect country-specific trunk prefixes (including Italy's significant zero). */
export function signInPhoneNumber(value: SignInPhone): string {
  const text = internationalInput(value.number);
  if (!/^[+\d\s().-]+$/.test(text)) throw new Error("invalidPhone");
  const parsed = parsePhoneNumberFromString(text, {
    defaultCountry: value.country,
    extract: false,
  });
  if (
    !parsed ||
    parsed.ext ||
    !parsed.isPossible() ||
    parsed.countryCallingCode !== getCountryCallingCode(value.country)
  )
    throw new Error("invalidPhone");
  return normalizePhone(parsed.number);
}
