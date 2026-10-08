import { FunctionsHttpError } from "@supabase/supabase-js";
import * as Network from "expo-network";
import { backend } from "../data/backend";
import type { PreviousShopResult } from "../domain/previous-shop";
export async function requestPreviousShop(
  shopId: string,
  imeis?: string[],
): Promise<PreviousShopResult> {
  const network = await Network.getNetworkStateAsync().catch(() => null);
  if (network?.isConnected === false || network?.isInternetReachable === false)
    throw new Error("previousShopOffline");
  if (!backend) throw new Error("previousShopUnavailable");
  const { data, error } = await backend.functions.invoke("previous-shop", {
    body: {
      action: imeis ? "lookup" : "status",
      shopId,
      ...(imeis ? { imeis } : {}),
    },
    timeout: 15000,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => ({}));
      throw new Error(detail.error ?? "previousShopUnavailable");
    }
    throw new Error("previousShopUnavailable");
  }
  if (typeof data?.enabled !== "boolean")
    throw new Error("previousShopUnavailable");
  return data;
}
