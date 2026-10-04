import type { Amendment, Transaction } from "./models";
import { digits } from "./validation";
export type MetricPeriod = "today" | "thisWeek" | "thisMonth";
export interface PeriodMetrics {
  count: number;
  purchases: number;
  sales: number;
  purchaseTotal: number;
  saleTotal: number;
  start: string;
}
const day = 86400000;
const kabulOffset = 270 * 60000;
/** Saturday-start weeks; calendar months follow the app's calendar preference. */
export function homeMetrics(
  records: Transaction[],
  amendments: Amendment[],
  now = new Date(),
  gregorian = false,
): Record<MetricPeriod, PeriodMetrics> {
  const shifted = new Date(now.getTime() + kabulOffset);
  const midnight =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - kabulOffset;
  const monthDay = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Kabul",
      calendar: gregorian ? "gregory" : "persian",
      numberingSystem: "latn",
      day: "numeric",
    })
      .formatToParts(now)
      .find((p) => p.type === "day")!.value,
  );
  const starts = {
    today: midnight,
    thisWeek: midnight - ((shifted.getUTCDay() + 1) % 7) * day,
    thisMonth: midnight - (monthDay - 1) * day,
  };
  const voided = new Set(amendments.filter(a => a.kind === "void").map(a => a.recordId));
  const latest = new Map<string, Amendment>();
  for (const a of amendments) {
    if (a.kind && a.kind !== "correction") continue;
    const previous = latest.get(a.recordId);
    if (
      !previous ||
      a.createdAt > previous.createdAt ||
      (a.createdAt === previous.createdAt && a.id > previous.id)
    )
      latest.set(a.recordId, a);
  }
  const result = Object.fromEntries(
    Object.entries(starts).map(([key, start]) => [
      key,
      {
        count: 0,
        purchases: 0,
        sales: 0,
        purchaseTotal: 0,
        saleTotal: 0,
        start: new Date(start).toISOString(),
      },
    ]),
  ) as Record<MetricPeriod, PeriodMetrics>;
  const seen = new Set<string>();
  for (const original of records) {
    if (seen.has(original.id) || voided.has(original.id)) continue;
    seen.add(original.id);
    const correction = latest.get(original.id)?.snapshot;
    const record =
      correction?.shopId === original.shopId ? correction : original;
    const timestamp = Date.parse(record.occurredAt);
    const price = Number(digits(record.price));
    if (
      !Number.isFinite(timestamp) ||
      timestamp > now.getTime() ||
      !Number.isFinite(price) ||
      price < 0
    )
      continue;
    for (const period of Object.keys(starts) as MetricPeriod[]) {
      if (timestamp < starts[period]) continue;
      const m = result[period];
      m.count++;
      if (record.direction === "buy") {
        m.purchases++;
        m.purchaseTotal += Math.round(price * 100);
      } else {
        m.sales++;
        m.saleTotal += Math.round(price * 100);
      }
    }
  }
  for (const m of Object.values(result)) {
    m.purchaseTotal /= 100;
    m.saleTotal /= 100;
  }
  return result;
}
