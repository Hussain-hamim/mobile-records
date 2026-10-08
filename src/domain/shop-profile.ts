import type { ShopProfile } from "./models";

export const requiredShopFields = ["shopName", "name", "address"] as const;

export function missingShopFields(profile?: Partial<ShopProfile> | null) {
  return requiredShopFields.filter((field) => !profile?.[field]?.trim());
}

export function isShopProfileComplete(profile?: Partial<ShopProfile> | null) {
  return missingShopFields(profile).length === 0;
}
