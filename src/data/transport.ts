import { backend } from "./backend";
import type {
  Membership,
  Operation,
  ShopProfile,
  Transaction,
  Amendment,
  Customer,
} from "../domain/models";
import type { SyncTransport } from "./repository";
export function transportFor(membership: Membership): SyncTransport {
  if (!backend) throw new Error("setup");
  const api = backend;
  async function rows(table: string, fields: string) {
    const result: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await api
        .from(table)
        .select(fields)
        .eq("shop_id", membership.shopId)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      result.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < 500) return result;
    }
  }
  return {
    async checkAccess() {
      const { data, error } = await api
        .from("memberships")
        .select("active")
        .eq("shop_id", membership.shopId)
        .eq("user_id", membership.userId)
        .single();
      if (error && error.code !== "PGRST116") throw new Error(error.message);
      if (!data?.active) throw new Error("noAccess");
      const status = await api
        .from("account_status")
        .select("must_change_password")
        .eq("user_id", membership.userId)
        .single();
      if (status.error) throw new Error(status.error.message);
      if (status.data.must_change_password) throw new Error("changePassword");
    },
    async push(op: Operation) {
      const { data, error } = await api.rpc("apply_operation", {
        p_shop: membership.shopId,
        p_id: op.id,
        p_kind: op.kind,
        p_payload: op.payload,
        p_base_version: op.baseVersion,
      });
      if (error) throw new Error(error.message);
      return data as { version: number };
    },
    async pull() {
      const [records, customers, amendments, shop] = await Promise.all([
        rows("records", "id,snapshot"),
        rows("customers", "id,person,version"),
        rows("amendments", "id,payload"),
        api
          .from("shops")
          .select("profile,version")
          .eq("id", membership.shopId)
          .single(),
      ]);
      if (shop.error) throw new Error(shop.error.message);
      return {
        records: records.map((r) => r.snapshot as Transaction),
        customers: customers as unknown as Customer[],
        amendments: amendments.map((a) => a.payload as Amendment),
        profile: shop.data.profile as ShopProfile,
        version: shop.data.version as number,
      };
    },
  };
}
