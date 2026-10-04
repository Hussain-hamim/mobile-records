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
export function phoneLabel(brand: string, model: string) {
  const name = (model.split(",")[0] || model).trim();
  const make = brand.trim();
  if (!make || name.toLowerCase().includes(make.toLowerCase()))
    return name || make;
  return `${make} ${name}`.trim();
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

/** Audit timestamps use the selected calendar and explicit Kabul local time. */
export function formatAuditDate(value: string, language: Language, gregorian: boolean) {
  const time = new Intl.DateTimeFormat(language === "en" ? "en-GB" : language === "fa" ? "fa-AF" : "ps-AF", { timeZone: "Asia/Kabul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
  return `${formatDate(value, language, gregorian)} · ${time}`;
}
