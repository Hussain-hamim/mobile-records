import {
  purchasedPhoneHistory,
  matchesPurchasedPhone,
  type PurchasedPhone,
} from "../domain/purchased-phones";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./repository";
import type { Customer, Transaction } from "../domain/models";
import { customerFromRow, scanTemplates } from "../domain/fingerprints";
import {
  homeMetrics,
  type MetricPeriod,
  type PeriodMetrics,
} from "../domain/home-metrics";
import {
  digits,
  matchesRecord,
  matchesTazkiraNumber,
  normalizeImei,
} from "../domain/validation";
import { localDay } from "../domain/format";

export type RecordCursor = { stamp: string; id: string };
export type Page<T, C> = { items: T[]; next: C | null };
export type ListedRecord = Transaction & { listVoided?: boolean };
export type RecordFilter = {
  query?: string;
  direction?: string;
  day?: string;
  customerId?: string;
  imei?: string;
  limit?: number;
};
export type Metrics = Record<MetricPeriod, PeriodMetrics>;

export function shopQueries(repo: Repository, api: SupabaseClient | null) {
  const cloud = repo.vault.storage === "cloud";
  const shopId = repo.membership.shopId;
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!api) throw new Error("setup");
    const request = api.rpc(name, { p_shop: shopId, ...args });
    const { data, error } = await (signal
      ? request.abortSignal(signal)
      : request);
    if (error) throw new Error(error.message);
    return data as T;
  }
  return {
    async purchasedPhones(
      filter: {
        query?: string;
        includeSold?: boolean;
        imeis?: string[];
        purchaseId?: string;
      } = {},
      cursor: RecordCursor | null = null,
      signal?: AbortSignal,
    ): Promise<Page<PurchasedPhone, RecordCursor>> {
      if (cloud)
        return rpc(
          "shop_purchased_phones",
          {
            p_query: filter.query ?? "",
            p_include_sold: filter.includeSold ?? false,
            p_imeis: filter.imeis?.map(normalizeImei).filter(Boolean) ?? null,
            p_purchase: filter.purchaseId ?? null,
            p_cursor: cursor,
          },
          signal,
        );
      const items = purchasedPhoneHistory(
        await repo.records(),
        await repo.amendments(),
      ).filter((item) => {
        const stamp = (item.purchase ?? item.latest).occurredAt;
        if (filter.imeis)
          return filter.imeis.some((id) =>
            item.imeis.includes(normalizeImei(id)),
          );
        if (filter.purchaseId)
          return item.purchaseIds.includes(filter.purchaseId);
        return (
          !!item.purchase &&
          (filter.includeSold || item.latest.direction === "buy") &&
          matchesPurchasedPhone(item, filter.query ?? "") &&
          (!cursor ||
            stamp < cursor.stamp ||
            (stamp === cursor.stamp && item.id < cursor.id))
        );
      });
      const shown = items.slice(0, 25),
        last = shown.at(-1);
      return {
        items: shown,
        next:
          items.length > 25 && last
            ? { id: last.id, stamp: (last.purchase ?? last.latest).occurredAt }
            : null,
      };
    },
    async records(
      filter: RecordFilter = {},
      cursor: RecordCursor | null = null,
      signal?: AbortSignal,
    ): Promise<Page<ListedRecord, RecordCursor>> {
      const limit = Math.min(50, Math.max(1, filter.limit ?? 25));
      if (cloud)
        return rpc(
          "shop_records_page",
          {
            p_query: digits(filter.query ?? "").trim(),
            p_direction:
              filter.direction === "all" ? null : (filter.direction ?? null),
            p_day: filter.day || null,
            p_customer: filter.customerId || null,
            p_imei: filter.imei ? normalizeImei(filter.imei) : null,
            p_cursor: cursor,
            p_limit: limit,
          },
          signal,
        );
      const amendments = await repo.amendments();
      const all = (await repo.records())
        .filter(
          (r) =>
            matchesRecord(r, filter.query ?? "") &&
            (!filter.direction ||
              filter.direction === "all" ||
              r.direction === filter.direction) &&
            (!filter.day || localDay(r.occurredAt) === filter.day) &&
            (!filter.customerId || r.customerId === filter.customerId) &&
            (!filter.imei ||
              [r.phone.imei1, r.phone.imei2].includes(
                normalizeImei(filter.imei),
              )) &&
            (!cursor ||
              r.occurredAt < cursor.stamp ||
              (r.occurredAt === cursor.stamp && r.id < cursor.id)),
        )
        .sort(
          (a, b) =>
            b.occurredAt.localeCompare(a.occurredAt) ||
            b.id.localeCompare(a.id),
        );
      const items = all.slice(0, limit).map((r) => ({
        ...r,
        listVoided: amendments.some(
          (a) => a.recordId === r.id && a.kind === "void",
        ),
      }));
      const last = items.at(-1);
      return {
        items,
        next:
          all.length > limit && last
            ? { stamp: last.occurredAt, id: last.id }
            : null,
      };
    },
    async customers(
      query = "",
      cursor: string | null = null,
      signal?: AbortSignal,
    ): Promise<Page<Customer, string>> {
      if (cloud) {
        const page = await rpc<Page<Record<string, unknown>, string>>(
          "shop_customers_page",
          { p_query: digits(query).trim(), p_cursor: cursor },
          signal,
        );
        return { ...page, items: page.items.map(customerFromRow) };
      }
      const q = digits(query).trim().toLocaleLowerCase();
      const items = (await repo.customers())
        .filter(
          (c) =>
            (!cursor || c.id > cursor) &&
            (matchesTazkiraNumber(c.person.idNumber, q) ||
              [c.person.name, c.person.phone, c.person.idNumber].some((s) =>
                digits(s).toLocaleLowerCase().includes(q),
              )),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      return {
        items: items.slice(0, 25),
        next: items.length > 25 ? items[24].id : null,
      };
    },
    customer(id: string) {
      return repo.vault.get<Customer>("customer:" + id);
    },
    async record(id: string) {
      const record = await repo.vault.get<Transaction>("record:" + id);
      if (!record) return null;
      const [customer, amendments] = await Promise.all([
        repo.vault.get<Customer>("customer:" + record.customerId),
        repo.amendments(id),
      ]);
      return { record, customer, amendments };
    },
    async metrics(
      now: Date,
      gregorian: boolean,
      signal?: AbortSignal,
    ): Promise<Metrics> {
      if (!cloud)
        return homeMetrics(
          await repo.records(),
          await repo.amendments(),
          now,
          gregorian,
        );
      const blank = homeMetrics([], [], now, gregorian);
      return rpc(
        "shop_period_metrics",
        {
          p_starts: Object.fromEntries(
            Object.entries(blank).map(([key, value]) => [key, value.start]),
          ),
          p_until: now.toISOString(),
        },
        signal,
      );
    },
    async fingerprintTemplates(signal?: AbortSignal) {
      if (!cloud) return scanTemplates(await repo.customers());
      const templates: ReturnType<typeof scanTemplates> = [];
      let cursor: string | null = null;
      do {
        if (signal?.aborted) throw new Error("fpInterrupted");
        const page: Page<Record<string, unknown>, string> = await rpc(
          "shop_customers_page",
          { p_fingerprints: true, p_limit: 100, p_cursor: cursor },
          signal,
        );
        templates.push(...scanTemplates(page.items.map(customerFromRow)));
        cursor = page.next;
      } while (cursor);
      return templates;
    },
  };
}
export type ShopQueries = ReturnType<typeof shopQueries>;
