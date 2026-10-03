export function normalizeLoginPhone(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalidPhone");
  let phone = value
    .replace(/[۰-۹٠-٩]/g, (c) =>
      String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)),
    )
    .replace(/[\s()-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  if (/^0\d{9}$/.test(phone)) phone = "+93" + phone.slice(1);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("invalidPhone");
  return phone;
}
export function normalizeLoginCode(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalidLoginCode");
  const code = value
    .replace(/[۰-۹٠-٩]/g, (c) =>
      String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632)),
    )
    .replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(code)) throw new Error("invalidLoginCode");
  return code;
}
export function generateLoginCode(): string {
  // Rejection sampling avoids modulo bias for the 100 million possible codes.
  const words = new Uint32Array(1);
  do {
    crypto.getRandomValues(words);
  } while (words[0] >= 4_200_000_000);
  return String(words[0] % 100_000_000).padStart(8, "0");
}
export async function hashLoginCode(
  phone: string,
  code: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`${phone}:${code}`)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export const loginEmail = (id: string) => `${id}@mobile-records.invalid`;
