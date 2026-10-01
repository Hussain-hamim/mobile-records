import type { Language } from "./models";
export function formatDate(
  date: string,
  language: Language,
  gregorian = false,
) {
  return new Intl.DateTimeFormat(
    language === "en" ? "en-GB" : language === "ps" ? "ps-AF" : "fa-AF",
    {
      calendar: gregorian ? "gregory" : "persian",
      timeZone: "Asia/Kabul",
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(new Date(date));
}
export function formatMoney(value: string | number, language: Language) {
  return (
    new Intl.NumberFormat(language === "en" ? "en" : "fa-AF", {
      maximumFractionDigits: 2,
    }).format(Number(value)) + " AFN"
  );
}
export function localDay(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
