export type Language = "ps" | "fa" | "en";
export type Direction = "buy" | "sell";
export type SyncState = "pending" | "synced" | "failed" | "conflict";
export interface Person {
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
export interface Draft {
  id: string;
  direction: Direction;
  phone: Phone;
  customer: Person;
  customerId: string;
  customerConfirmed: boolean;
  price: string;
  createdAt: string;
  step: number;
}
export interface Customer {
  id: string;
  person: Person;
  version: number;
}
export interface Transaction {
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
  templateVersion: "draft-v1";
  syncState: SyncState;
}
export interface Amendment {
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
