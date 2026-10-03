// Trusted administrator workstation only. Never put this key in EXPO_PUBLIC_*.
const [command, phone, shopName] = process.argv.slice(2);
const action = command === "reset" ? "issue-code" : command;
if (
  !["onboard", "issue-code"].includes(action) ||
  !/^\+[1-9]\d{7,14}$/.test(phone ?? "") ||
  (action === "onboard" && !shopName)
) {
  throw new Error(
    'Usage: node scripts/admin.mjs onboard +93700123456 "Shop name" OR issue-code +93700123456',
  );
}
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the trusted administrator workstation.",
  );
const response = await fetch(url + "/functions/v1/admin-accounts", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    apikey: key,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ action, phone, shopName }),
});
const result = await response.json();
if (!response.ok || result.error)
  throw new Error(result.error ?? "Account operation failed");
console.log("Phone:", result.phone);
console.log("One-time login code (deliver privately):", result.code);
console.log("Expires:", result.expiresAt);
