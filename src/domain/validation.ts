import type { Draft, Transaction } from "./models";
export function digits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (c) =>
    String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)),
  );
}
export function normalizeImei(value: string) {
  return digits(value).replace(/[\s-]/g, "");
}
export function validImei(value: string): boolean {
  const n = normalizeImei(value);
  if (!/^\d{15}$/.test(n) || /^(\d)\1{14}$/.test(n)) return false;
  return (
    [...n].reduce((sum, c, i) => {
      const x = Number(c) * (i % 2 ? 2 : 1);
      return sum + (x > 9 ? x - 9 : x);
    }, 0) %
      10 ===
    0
  );
}
export function extractImeis(text: string): string[] {
  return [
    ...new Set(
      (digits(text).match(/(?<!\d)\d(?:[ -]?\d){14}(?!\d)/g) ?? [])
        .map(normalizeImei)
        .filter(validImei),
    ),
  ];
}
export function normalizePhone(value: string): string {
  let n = digits(value).replace(/[\s()-]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  if (/^0\d{9}$/.test(n)) n = "+93" + n.slice(1);
  if (!/^\+[1-9]\d{7,14}$/.test(n)) throw new Error("invalidPhone");
  return n;
}
export function validateDraft(draft: Draft): string[] {
  const errors: string[] = [];
  if (!validImei(draft.phone.imei1)) errors.push("invalidImei");
  if (
    draft.phone.imei2 &&
    (!validImei(draft.phone.imei2) ||
      normalizeImei(draft.phone.imei2) === normalizeImei(draft.phone.imei1))
  )
    errors.push("invalidSecondImei");
  if (
    !draft.phone.model.trim() ||
    !draft.customer.name.trim() ||
    !draft.customer.idNumber.trim()
  )
    errors.push("requiredFields");
  if (
    !/^\d{1,10}(\.\d{1,2})?$/.test(digits(draft.price)) ||
    Number(digits(draft.price)) <= 0
  )
    errors.push("invalidPrice");
  return errors;
}
export function latestRecordForCustomer(
  records: Transaction[],
  customerId: string,
): Transaction | undefined {
  return records
    .filter((record) => record.customerId === customerId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
}
export function matchesRecord(record: Transaction, query: string): boolean {
  const needle = digits(query).trim().toLocaleLowerCase();
  return [
    record.reference,
    record.customer.name,
    record.customer.phone,
    record.customer.idNumber,
    record.phone.imei1,
    record.phone.imei2,
    record.phone.brand,
    record.phone.model,
  ].some((v) => digits(v).toLocaleLowerCase().includes(needle));
}
export function parties(record: Transaction) {
  return record.direction === "buy"
    ? { buyer: record.shop, seller: record.customer }
    : { buyer: record.customer, seller: record.shop };
}
