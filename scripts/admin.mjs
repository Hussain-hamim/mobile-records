// Trusted administrator workstation only. Never put this key in EXPO_PUBLIC_*.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const [action, phone, shopName] = process.argv.slice(2);
if (
  !["onboard", "reset"].includes(action) ||
  !/^\+[1-9]\d{7,14}$/.test(phone ?? "") ||
  (action === "onboard" && !shopName)
)
  throw new Error(
    'Usage: node scripts/admin.mjs onboard +93700123456 "Shop name" OR reset +93700123456',
  );
const api = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const password = randomUUID() + "aA!";
if (action === "onboard") {
  const { data, error } = await api.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  const shopId = randomUUID();
  for (const [table, row] of [
    ["account_status", { user_id: data.user.id, must_change_password: true }],
    ["shops", { id: shopId, profile: { shopName } }],
    ["memberships", { shop_id: shopId, user_id: data.user.id, role: "owner" }],
  ]) {
    const { error } = await api.from(table).insert(row);
    if (error)
      throw new Error(
        `Provisioning incomplete at ${table}; inspect created user ${data.user.id} and shop ${shopId}. ${error.message}`,
      );
  }
} else {
  let found;
  for (let page = 1; !found; page++) {
    const { data, error } = await api.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    found = data.users.find((u) => u.phone === phone.replace("+", ""));
    if (data.users.length < 100) break;
  }
  if (!found) throw new Error("Account not found");
  const gate = await api
    .from("account_status")
    .update({ must_change_password: true })
    .eq("user_id", found.id);
  if (gate.error) throw gate.error;
  const { error } = await api.auth.admin.updateUserById(found.id, { password });
  if (error) throw error;
}
console.log(
  "Temporary password (deliver privately; change required):",
  password,
);
