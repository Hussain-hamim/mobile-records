import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vault } from "./vault";
import type { Membership, Operation } from "../domain/models";
import { customerFromRow } from "../domain/fingerprints";

/** Canonical tables are the only store. No SQLite, local outbox, or persisted cache. */
export function cloudVault(api: SupabaseClient, membership: Membership): Vault {
  let closed = false;
  let pending: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>) {
    if (closed) return Promise.reject(new Error("Cloud session is closed"));
    const result = pending.catch(() => {}).then(work);
    pending = result;
    return result;
  }
  const sources = {
    record: { table: "records", fields: "id,snapshot" },
    customer: {
      table: "customers",
      fields:
        "id,person,fingerprint_template,fingerprints,fingerprint_audit,version",
    },
    amendment: { table: "amendments", fields: "id,payload" },
    draft: { table: "transaction_drafts", fields: "id,payload" },
  };
  async function read(prefix: string, id?: string) {
    if (prefix === "op") return [];
    const source = sources[prefix as keyof typeof sources];
    if (!source) throw new Error("Unsupported cloud collection");
    const result: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = api
        .from(source.table)
        .select(source.fields)
        .eq("shop_id", membership.shopId)
        .order("id")
        .range(offset, offset + 499);
      if (prefix === "draft") query = query.eq("user_id", membership.userId);
      if (id) query = query.eq("id", id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      for (const item of data ?? []) {
        const row = item as unknown as Record<string, unknown>;
        result.push(
          prefix === "customer"
            ? customerFromRow(row)
            : prefix === "draft"
              ? row.payload
              : {
                  ...((prefix === "record"
                    ? row.snapshot
                    : row.payload) as object),
                  syncState: "synced",
                },
        );
      }
      if (!data || data.length < 500) return result;
    }
  }
  return {
    storage: "cloud",
    get<T>(key: string) {
      return enqueue(async () => {
        if (key === "profile") {
          const { data, error } = await api
            .from("shops")
            .select("profile,version")
            .eq("id", membership.shopId)
            .single();
          if (error) throw new Error(error.message);
          membership.profile = data.profile;
          membership.version = data.version;
          return data.profile as T;
        }
        const separator = key.indexOf(":");
        return ((
          await read(key.slice(0, separator), key.slice(separator + 1))
        )[0] ?? null) as T | null;
      });
    },
    list<T>(prefix: string) {
      return enqueue(async () => (await read(prefix.replace(/:$/, ""))) as T[]);
    },
    batch(changes) {
      return enqueue(async () => {
        const operations = changes
          .filter((c) => c.key.startsWith("op:") && c.value)
          .map((c) => c.value as Operation);
        const drafts = changes
          .filter((c) => c.key.startsWith("draft:"))
          .map((c) => ({ id: c.key.slice(6), value: c.value }));
        if (!operations.length && !drafts.length) return;
        const { error } = await api.rpc("save_cloud_changes", {
          p_shop: membership.shopId,
          p_operations: operations,
          p_drafts: drafts,
        });
        if (error) throw new Error(error.message);
      });
    },
    async close() {
      closed = true;
      await pending.catch(() => {});
    },
  };
}
