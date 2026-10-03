import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.117.2";
import {
  generateLoginCode,
  hashLoginCode,
  loginEmail,
  normalizeLoginPhone,
} from "./login-code-core.ts";
import { encryptLoginCode, decryptLoginCode } from "./login-code-encryption.ts";
export const responseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });
export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export const codeSecret = () =>
  Deno.env.get("LOGIN_CODE_PEPPER") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export async function issueCode(
  admin: SupabaseClient,
  userId: string,
  actorId: string | null,
) {
  const {
    data: { user },
    error,
  } = await admin.auth.admin.getUserById(userId);
  if (error || !user?.phone) throw new Error("Account not found");
  const phone = normalizeLoginPhone("+" + user.phone.replace(/^\+/, ""));
  // Replace any legacy password with an undisclosed random secret. This alias is
  // used only for Supabase's server-side token exchange; nothing is emailed.
  const updated = await admin.auth.admin.updateUserById(userId, {
    email: loginEmail(userId),
    email_confirm: true,
    phone_confirm: true,
    password: crypto.randomUUID() + "aA7!",
  });
  if (updated.error)
    throw new Error("Could not prepare account", {
      cause: { code: updated.error.code, message: updated.error.message },
    });
  const code = generateLoginCode();
  const hash = await hashLoginCode(phone, code, codeSecret());
  const encrypted = await encryptLoginCode(code, userId, phone, codeSecret());
  const { data: expiresAt, error: issueError } = await admin.rpc(
    "issue_recoverable_login_code",
    {
      p_user: userId,
      p_phone: phone,
      p_hash: hash,
      p_encrypted: encrypted,
      p_actor: actorId,
    },
  );
  if (issueError) throw new Error("Could not issue login code");
  return { phone, code, expiresAt };
}
export async function readActiveCode(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.rpc("read_active_login_code", {
    p_user: userId,
  });
  if (error) throw new Error("Could not check login code");
  if (!data)
    return {
      code: null,
      reason:
        "No valid code. It may have been used, expired, replaced, or locked. Generate a new login code.",
    };
  if (!data.encryptedCode)
    return {
      code: null,
      reason:
        "This code was generated before code retrieval was added. Generate a new login code once to make it viewable here.",
    };
  const code = await decryptLoginCode(
    data.encryptedCode,
    userId,
    data.phone,
    codeSecret(),
  );
  // Re-check after decryption in case another request consumed/replaced it.
  const current = await admin.rpc("read_active_login_code", { p_user: userId });
  if (current.error) throw new Error("Could not check login code");
  if (current.data?.encryptedCode !== data.encryptedCode)
    return {
      code: null,
      reason:
        "This code is no longer valid. Open the current code or generate a new one.",
    };
  return {
    code: { phone: data.phone, code, expiresAt: data.expiresAt },
    reason: null,
  };
}
export async function findUserByPhone(admin: SupabaseClient, phone: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("Could not look up account");
    const user = data.users.find(
      (u) => u.phone?.replace(/^\+/, "") === phone.slice(1),
    );
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}
