import {
  emptyPhone,
  type Amendment,
  type Draft,
  type Phone,
  type Transaction,
} from "./models";
import { digits, normalizeImei } from "./validation";

export type PhoneRecord = Pick<
  Transaction,
  "id" | "reference" | "occurredAt" | "direction" | "phone"
>;
export type PurchasedPhone = {
  id: string;
  purchase: PhoneRecord | null;
  latest: PhoneRecord;
  imeis: string[];
  purchaseIds: string[];
  references: string[];
};
export const reusablePhoneFields = [
  "brand",
  "model",
  "color",
  "simCount",
  "storage",
  "ram",
  "imei1",
  "imei2",
] as const;
export function phoneImeis(phone: Phone): string[] {
  return [
    ...new Set([phone.imei1, phone.imei2].map(normalizeImei).filter(Boolean)),
  ];
}
function newest(
  a: { occurredAt: string; id: string },
  b: { occurredAt: string; id: string },
) {
  return b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id);
}
/** Same history rules as the server, for demo/local repositories. IMEI pairs form one device. */
export function purchasedPhoneHistory(
  records: Transaction[],
  amendments: Amendment[],
): PurchasedPhone[] {
  const voids = new Set(
    amendments.filter((a) => a.kind === "void").map((a) => a.recordId),
  );
  const changes = new Map<string, Amendment>();
  for (const a of amendments) {
    if (a.kind && a.kind !== "correction") continue;
    const old = changes.get(a.recordId);
    if (
      !old ||
      a.createdAt > old.createdAt ||
      (a.createdAt === old.createdAt && a.id > old.id)
    )
      changes.set(a.recordId, a);
  }
  const rows = records
    .filter((r) => !voids.has(r.id))
    .map((r) => changes.get(r.id)?.snapshot ?? r)
    .sort(newest);
  const parent = new Map<string, string>();
  function root(key: string): string {
    const p = parent.get(key);
    if (!p) {
      parent.set(key, key);
      return key;
    }
    if (p === key) return key;
    const result = root(p);
    parent.set(key, result);
    return result;
  }
  for (const r of rows) {
    const ids = phoneImeis(r.phone);
    for (const id of ids) parent.set(root(id), root(ids[0]));
  }
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    const imei = phoneImeis(row.phone)[0];
    if (!imei) continue;
    const key = root(imei);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const summary = (r: Transaction): PhoneRecord => ({
    id: r.id,
    reference: r.reference,
    occurredAt: r.occurredAt,
    direction: r.direction,
    phone: { ...r.phone },
  });
  return [...groups.values()]
    .map((group) => {
      const purchases = group.filter((r) => r.direction === "buy");
      return {
        id: (purchases[0] ?? group[0]).id,
        purchase: purchases[0] ? summary(purchases[0]) : null,
        latest: summary(group[0]),
        imeis: [...new Set(group.flatMap((r) => phoneImeis(r.phone)))],
        purchaseIds: purchases.map((r) => r.id),
        references: purchases.map((r) => r.reference),
      };
    })
    .sort((a, b) => newest(a.purchase ?? a.latest, b.purchase ?? b.latest));
}
export function matchesPurchasedPhone(item: PurchasedPhone, query: string) {
  const p = item.purchase;
  const q = digits(query).trim().toLocaleLowerCase();
  return (
    !!p &&
    [p.phone.brand, p.phone.model, ...item.imeis, ...item.references].some(
      (v) => digits(v).toLocaleLowerCase().includes(q),
    )
  );
}
export function applyPurchasedPhone(draft: Draft, item: PurchasedPhone): Draft {
  if (!item.purchase) throw new Error("purchaseUnavailable");
  const phone = { ...draft.phone };
  for (const key of reusablePhoneFields) phone[key] = item.purchase.phone[key];
  return {
    ...draft,
    direction: "sell",
    sourcePurchaseId: item.purchase.id,
    phone,
  };
}
export function wouldReplacePhone(current: Phone, incoming: Phone) {
  const empty = emptyPhone();
  return reusablePhoneFields.some(
    (key) =>
      current[key].trim() &&
      current[key] !== empty[key] &&
      current[key] !== incoming[key],
  );
}
export function soldWarningKey(items: PurchasedPhone[]) {
  return items
    .filter((x) => x.latest.direction === "sell")
    .map(
      (x) =>
        `${x.latest.id}:${x.latest.occurredAt}:${phoneImeis(x.latest.phone).sort().join(",")}`,
    )
    .sort()
    .join("|");
}

export function assertPurchaseSource(
  draft: Draft,
  original: Transaction | null,
  amendments: Amendment[],
  shopId: string,
) {
  const changes = amendments.filter((a) => a.recordId === original?.id);
  const effective =
    changes
      .filter((a) => !a.kind || a.kind === "correction")
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )[0]?.snapshot ?? original;
  if (
    draft.direction !== "sell" ||
    !original ||
    original.shopId !== shopId ||
    effective?.direction !== "buy" ||
    changes.some((a) => a.kind === "void") ||
    !phoneImeis(effective.phone).some((id) =>
      phoneImeis(draft.phone).includes(id),
    )
  )
    throw new Error("purchaseUnavailable");
}
/** Recheck after the confirmation too, so a second sale while a dialog is open needs a new acknowledgement. */
export async function confirmSaleHistory(
  check: () => Promise<PurchasedPhone[]>,
  confirm: (references: string) => Promise<boolean>,
  current: () => boolean,
): Promise<boolean> {
  let items = await check();
  while (current()) {
    const key = soldWarningKey(items);
    if (!key) return true;
    if (
      !(await confirm(
        items
          .filter((x) => x.latest.direction === "sell")
          .map((x) => x.latest.reference)
          .join(", "),
      )) ||
      !current()
    )
      return false;
    items = await check();
    if (current() && soldWarningKey(items) === key) return true;
  }
  return false;
}
