export type NetworkKind = "offer" | "request";
export type NetworkSection = "directory" | "connections" | "board" | "audit";
export type BusinessDevice = {
  brand: string;
  model: string;
  color?: string;
  storage?: string;
  price?: string;
};
export type NetworkProfile = {
  shop_id: string;
  name: string;
  area: string;
  contact: string;
  enabled: boolean;
  status: "pending" | "approved" | "suspended";
  version: number;
};
export type NetworkStatus = {
  profile: NetworkProfile | null;
  canShare: boolean;
  owner: boolean;
  members: {
    user_id: string;
    role: string;
    phone?: string;
    can_share: boolean;
  }[];
};
export type NetworkShop = NetworkProfile & {
  id: string;
  connection_status?: "pending" | "accepted" | "disconnected";
  connection_version?: number;
  requested_by?: string;
  blocked?: boolean;
};
export type NetworkPost = {
  id: string;
  shop_id: string;
  name: string;
  kind: "offer" | "request";
  device: BusinessDevice;
  expires_at: string;
  created_at: string;
};
export type NetworkAudit = {
  id: string;
  action: string;
  at: string;
  details: Record<string, unknown>;
};
export type NetworkRow = NetworkShop | NetworkPost | NetworkAudit;
export type NetworkPage<T> = { items: T[]; next: number | null };
export type NetworkCall = <T>(
  action: string,
  data?: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<T>;
