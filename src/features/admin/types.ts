export interface ShopSummary {
  id: string;
  name: string;
  address: string;
  members: number;
  activeMembers: number;
}
export interface AdminMember {
  user_id: string;
  phone: string;
  role: string;
  active: boolean;
  activated: boolean;
}
export interface ShopDetail {
  shop: { id: string; profile: Record<string, string> };
  members: AdminMember[];
  recordCount: number;
}
export interface Overview {
  shops: number;
  accounts: number;
  activeAccounts: number;
  records: number;
  pendingCodes: number;
  recentActivity: { action: string; user_id: string; at: string }[];
}
export interface IssuedCode {
  phone: string;
  code: string;
  expiresAt: string;
}
export interface CodeLookup {
  code: IssuedCode | null;
  reason: string | null;
}
