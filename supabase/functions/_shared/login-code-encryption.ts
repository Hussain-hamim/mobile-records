// Recoverable codes are encrypted only on the server. Bind every ciphertext to
// its account and phone, with a fresh nonce and a domain-separated derived key.
const encoder = new TextEncoder();
async function encryptionKey(secret: string) {
  if (!secret) throw new Error("Missing login code encryption secret");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("radefy-login-code-v1"),
      info: encoder.encode("admin-code-retrieval"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const context = (userId: string, phone: string) =>
  encoder.encode(JSON.stringify([userId, phone]));
export async function encryptLoginCode(
  code: string,
  userId: string,
  phone: string,
  secret: string,
): Promise<string> {
  if (!/^\d{8}$/.test(code)) throw new Error("Invalid login code");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: context(userId, phone) },
      await encryptionKey(secret),
      encoder.encode(code),
    ),
  );
  return "v1." + btoa(String.fromCharCode(...iv, ...ciphertext));
}
export async function decryptLoginCode(
  value: string,
  userId: string,
  phone: string,
  secret: string,
): Promise<string> {
  if (!value.startsWith("v1."))
    throw new Error("Unsupported encrypted login code");
  const bytes = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
  if (bytes.length !== 36) throw new Error("Invalid encrypted login code");
  const code = new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(0, 12),
        additionalData: context(userId, phone),
      },
      await encryptionKey(secret),
      bytes.slice(12),
    ),
  );
  if (!/^\d{8}$/.test(code)) throw new Error("Invalid decrypted login code");
  return code;
}
