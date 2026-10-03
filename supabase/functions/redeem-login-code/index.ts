import { adminClient, codeSecret, json } from "../_shared/login-codes.ts";
import {
  hashLoginCode,
  loginEmail,
  normalizeLoginCode,
  normalizeLoginPhone,
} from "../_shared/login-code-core.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const phone = normalizeLoginPhone(body.phone);
    const code = normalizeLoginCode(body.code);
    const admin = adminClient();
    const { data: userId, error } = await admin.rpc("consume_login_code", {
      p_phone: phone,
      p_hash: await hashLoginCode(phone, code, codeSecret()),
    });
    if (error) return json({ error: "loginUnavailable" }, 503);
    if (!userId) return json({ error: "invalidLoginCode" }, 401);
    const {
      data: { user },
      error: userError,
    } = await admin.auth.admin.getUserById(userId);
    if (
      userError ||
      !user ||
      "+" + user.phone?.replace(/^\+/, "") !== phone ||
      user.email !== loginEmail(userId)
    )
      return json({ error: "invalidLoginCode" }, 401);
    // Generate, then consume a Supabase token entirely on the server. Neither a
    // password nor the internal magic link is exposed to the app or delivered.
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    if (link.error) return json({ error: "loginCodeExchangeFailed" }, 503);
    const verified = await adminClient().auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: "magiclink",
    });
    if (
      verified.error ||
      !verified.data.session ||
      verified.data.user?.id !== userId
    )
      return json({ error: "loginCodeExchangeFailed" }, 503);
    // This legacy flag now gates accounts that have not completed activation.
    const status = await admin
      .from("account_status")
      .update({ must_change_password: false })
      .eq("user_id", userId)
      .select("user_id")
      .single();
    if (status.error) return json({ error: "loginCodeExchangeFailed" }, 503);
    return json({
      session: {
        access_token: verified.data.session.access_token,
        refresh_token: verified.data.session.refresh_token,
      },
    });
  } catch {
    return json({ error: "invalidLoginCode" }, 401);
  }
});
