import type { Language } from "./models";
import { digits } from "./validation";
export function formatDate(
  date: string,
  language: Language,
  gregorian = false,
) {
  return new Intl.DateTimeFormat(
    language === "en" ? "en-GB" : language === "ps" ? "ps-AF" : "fa-AF",
    {
      calendar: gregorian ? "gregory" : "persian",
      numberingSystem: "latn",
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(new Date(date));
}
export function formatMoney(value: string | number, _language: Language) {
  return (
    new Intl.NumberFormat("en-GB", {
      numberingSystem: "latn",
      maximumFractionDigits: 2,
    }).format(Number(digits(String(value)))) + " AFN"
  );
}
export function localDay(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    numberingSystem: "latn",
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
