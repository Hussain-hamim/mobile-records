import type {
  NetworkCall,
  NetworkShop,
  NetworkPost,
  NetworkStatus,
  BusinessDevice,
} from "./types";
/** Synthetic, screen-scoped demo. Never accesses the production backend. */
export function demoNetwork(shopId: string): NetworkCall {
  const now = () => new Date().toISOString(),
    expiry = () => new Date(Date.now() + 7 * 86400000).toISOString();
  const shops: NetworkShop[] = [
    {
      id: "demo-peer-one",
      shop_id: "demo-peer-one",
      name: "Kabul Mobile • Demo",
      area: "Kabul",
      contact: "Demo business contact",
      enabled: true,
      status: "approved",
      version: 1,
      connection_status: "accepted",
      connection_version: 1,
    },
    {
      id: "demo-peer-two",
      shop_id: "demo-peer-two",
      name: "Balkh Phones • Demo",
      area: "Mazar",
      contact: "Demo business contact",
      enabled: true,
      status: "approved",
      version: 1,
      connection_status: "pending",
      requested_by: "demo-peer-two",
      connection_version: 1,
    },
  ];
  const status: NetworkStatus = {
    profile: {
      shop_id: shopId,
      name: "Your demo shop",
      area: "Kabul",
      contact: "Demo contact",
      enabled: true,
      status: "approved",
      version: 1,
    },
    canShare: true,
    owner: true,
    members: [],
  };
  let posts: NetworkPost[] = [
    {
      id: "demo-offer",
      shop_id: shops[0].id,
      name: shops[0].name,
      kind: "offer",
      device: {
        brand: "Apple",
        model: "iPhone 13",
        color: "Blue",
        storage: "128 GB",
        price: "25000",
      },
      created_at: now(),
      expires_at: expiry(),
    },
  ];
  return async <T>(
    action: string,
    d: Record<string, unknown> = {},
  ): Promise<T> => {
    let result: unknown = { ok: true };
    const peer = shops.find((s) => s.id === d.target);
    if (action === "status") result = status;
    else if (action === "list") {
      let items: unknown[] =
        d.section === "directory"
          ? shops.filter((s) => !s.blocked)
          : d.section === "connections"
            ? shops
            : d.section === "board"
              ? posts.filter(
                  (p) =>
                    p.shop_id === shopId ||
                    shops.some(
                      (s) =>
                        s.id === p.shop_id &&
                        s.connection_status === "accepted" &&
                        !s.blocked,
                    ),
                )
              : [];
      const query = String(d.query ?? "").toLowerCase();
      if (query)
        items = items.filter((i) =>
          JSON.stringify(i).toLowerCase().includes(query),
        );
      const offset = Number(d.offset ?? 0);
      result = {
        items: items.slice(offset, offset + 25),
        next: items.length > offset + 25 ? offset + 25 : null,
      };
    } else if (action === "profile") {
      Object.assign(status.profile!, {
        name: d.name,
        area: d.area,
        contact: d.contact,
        enabled: d.enabled,
      });
      status.profile!.version++;
    } else if (
      ["connect", "accept", "disconnect", "block", "unblock"].includes(
        action,
      ) &&
      peer
    ) {
      peer.connection_status =
        action === "accept"
          ? "accepted"
          : action === "connect"
            ? "pending"
            : "disconnected";
      peer.requested_by = action === "connect" ? shopId : peer.requested_by;
      peer.blocked = action === "block";
      peer.connection_version = (peer.connection_version ?? 0) + 1;
    } else if (action === "post")
      posts.unshift({
        id: String(d.id),
        shop_id: shopId,
        name: status.profile!.name,
        kind: d.kind as "offer" | "request",
        device: d.device as BusinessDevice,
        created_at: now(),
        expires_at: expiry(),
      });
    else if (action === "close-post")
      posts = posts.filter((p) => p.id !== d.id);
    return JSON.parse(JSON.stringify(result)) as T;
  };
}
