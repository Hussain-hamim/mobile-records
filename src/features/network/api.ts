import { backend } from "../../data/backend";
import type { NetworkCall, NetworkPage, NetworkRow } from "./types";
export function networkApi(shopId: string): NetworkCall {
  return async <T>(
    action: string,
    data: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> => {
    if (!backend) throw new Error("networkUnavailable");
    let request = backend.rpc("shop_network", {
      p_shop: shopId,
      p_action: action,
      p_data: data,
    });
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
  };
}
export async function networkPage(
  call: NetworkCall,
  section: string,
  offset: number | null,
  query = "",
  signal?: AbortSignal,
): Promise<NetworkPage<NetworkRow>> {
  const p = await call<NetworkPage<NetworkRow>>(
    "list",
    { section, offset: offset ?? 0, query },
    signal,
  );
  return {
    ...p,
    items: p.items.map((r, i) => ({
      ...r,
      id: r.id || ("shop_id" in r ? r.shop_id : `${offset ?? 0}-${i}`),
    })),
  };
}
