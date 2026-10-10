export type Language = "ps" | "fa" | "en";
export type Direction = "buy" | "sell";
export type SyncState = "pending" | "synced" | "failed" | "conflict";
export type TazkiraType = "enid" | "pnid";
export interface Person {
  idType?: TazkiraType; // Absent on older saved records; never rewrite historical snapshots.
  name: string;
  fatherName: string;
  grandfatherName: string;
  idNumber: string;
  originalAddress: string;
  currentAddress: string;
  phone: string;
  occupation: string;
  workplace: string;
  relativePhone: string;
  idVolume: string;
  idPage: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
}
export interface ShopProfile extends Person {
  shopName: string;
  licenceNumber: string;
  shopNumber: string;
  address: string;
}
export interface Phone {
  brand: string;
  model: string;
  color: string;
  simCount: string;
  imei1: string;
  imei2: string;
  storage: string;
  ram: string;
  condition: string;
  notes: string;
}
export type FingerprintSlot = "primary" | "backup";
export interface FingerprintEntry {
  id: string;
  slot: FingerprintSlot;
  template: string;
  enrolledAt: string | null;
  enrolledBy: string | null;
}
export interface FingerprintAudit {
  slot: FingerprintSlot;
  action: "add" | "replace" | "remove";
  reason: string;
  at: string;
  by: string;
}
export type FingerprintSkipReason =
  "readerUnavailable" | "customerUnable" | "customerDeclined" | "otherReason";
export interface FingerprintSkip {
  reason: FingerprintSkipReason;
  note: string;
}
export interface Draft {
  sourcePurchaseId?: string;
  id: string;
  direction: Direction;
  phone: Phone;
  customer: Person;
  customerId: string;
  customerConfirmed: boolean;
  fingerprintTemplate?: string; // Legacy read compatibility only.
  fingerprints?: FingerprintEntry[];
  fingerprintSkip?: FingerprintSkip;
  price: string;
  createdAt: string;
  step: number;
}
export interface Customer {
  id: string;
  person: Person;
  fingerprintTemplate?: string; // Legacy read compatibility only.
  fingerprints?: FingerprintEntry[];
  fingerprintAudit?: FingerprintAudit[];
  profileAudit?: ProfileAudit[];
  version: number;
}
export interface ProfileAudit {
  at: string;
  by: string;
  reason: string;
  changes: Partial<Record<keyof Person, { before: string; after: string }>>;
}
export interface Transaction {
  sourcePurchaseId?: string;
  id: string;
  reference: string;
  shopId: string;
  createdBy: string;
  direction: Direction;
  phone: Phone;
  customer: Person;
  customerId: string;
  shop: ShopProfile;
  price: string;
  currency: "AFN";
  occurredAt: string;
  fingerprintSkip?: FingerprintSkip & { at: string; by: string };
  templateVersion: "draft-v1";
  syncState: SyncState;
}
export interface Amendment {
  kind?: "correction" | "void" | "photo";
  previousAmendmentId?: string | null;
  photoChange?: {
    slot: "person" | "idFront";
    action: "add" | "replace" | "remove" | "adjust";
  };
  id: string;
  recordId: string;
  reason: string;
  snapshot: Transaction;
  createdAt: string;
  createdBy: string;
  syncState: SyncState;
}
export interface Membership {
  shopId: string;
  userId: string;
  role: "owner" | "staff";
  profile: ShopProfile;
  version: number;
}
export interface Operation {
  id: string;
  kind: "record" | "customer" | "shop" | "amendment";
  payload: unknown;
  baseVersion: number;
  state: SyncState;
  error?: string;
}
export const emptyPerson = (): Person => ({
  idType: "enid",
  name: "",
  fatherName: "",
  grandfatherName: "",
  idNumber: "",
  originalAddress: "",
  currentAddress: "",
  phone: "",
  occupation: "",
  workplace: "",
  relativePhone: "",
  idVolume: "",
  idPage: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
});
export const emptyPhone = (): Phone => ({
  brand: "",
  model: "",
  color: "",
  simCount: "1",
  imei1: "",
  imei2: "",
  storage: "",
  ram: "",
  condition: "",
  notes: "",
});
export const emptyShop = (): ShopProfile => ({
  ...emptyPerson(),
  shopName: "",
  licenceNumber: "",
  shopNumber: "",
  address: "",
});
