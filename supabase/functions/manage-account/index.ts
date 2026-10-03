import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  issueCode,
  responseHeaders as headers,
} from "../_shared/login-codes.ts";
Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) throw new Error("Unauthorized");
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user) throw new Error("Unauthorized");
    const body = await request.json();
    const { data: own, error: membershipError } = await admin
      .from("memberships")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true);
    if (membershipError || !own?.length) throw new Error("noAccess");
    const { data: status } = await admin
      .from("account_status")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (
      !status ||
      status.must_change_password ||
      !own.some((m) => m.shop_id === body.shopId && m.role === "owner")
    )
      throw new Error("noAccess");
    if (body.action === "issue-code") {
      const target = await admin
        .from("memberships")
        .select("user_id")
        .eq("shop_id", body.shopId)
        .eq("user_id", body.userId)
        .eq("role", "staff")
        .eq("active", true)
        .maybeSingle();
      if (target.error || !target.data) throw new Error("noAccess");
      // Do not let a shop owner assume an account with access to another shop.
      const scopes = await admin
        .from("memberships")
        .select("shop_id,role")
        .eq("user_id", body.userId)
        .eq("active", true);
      if (
        scopes.error ||
        scopes.data.some((m) => m.shop_id !== body.shopId || m.role !== "staff")
      )
        throw new Error("Contact platform administrator");
      const platform = await admin.rpc("is_platform_administrator", {
        p_user: body.userId,
      });
      if (platform.error || platform.data)
        throw new Error("Contact platform administrator");
      return Response.json(await issueCode(admin, body.userId, user.id), {
        headers,
      });
    }
    if (body.action === "list") {
      const { data, error } = await admin
        .from("memberships")
        .select("user_id,role,active")
        .eq("shop_id", body.shopId);
      if (error) throw error;
      const members = await Promise.all(
        data.map(async (m) => {
          const { data: account } = await admin.auth.admin.getUserById(
            m.user_id,
          );
          return { ...m, phone: account.user?.phone ?? "" };
        }),
      );
      return Response.json({ members }, { headers });
    }
    if (body.action === "revoke") {
      const { error, data } = await admin
        .from("memberships")
        .update({ active: false })
        .eq("shop_id", body.shopId)
        .eq("user_id", body.userId)
        .eq("role", "staff")
        .select();
      if (error || !data?.length) throw new Error("Cannot revoke this account");
      return Response.json({ ok: true }, { headers });
    }
    if (body.action === "invite") {
      if (
        typeof body.phone !== "string" ||
        !/^\+[1-9]\d{7,14}$/.test(body.phone)
      )
        throw new Error("Invalid phone");
      const { data, error } = await admin.auth.admin.createUser({
        phone: body.phone,
        phone_confirm: true,
      });
      if (error || !data.user)
        throw new Error(
          "Account could not be created; contact administrator if it already exists.",
        );
      try {
        const s = await admin
          .from("account_status")
          .insert({ user_id: data.user.id, must_change_password: true });
        if (s.error) throw s.error;
        const m = await admin.from("memberships").insert({
          user_id: data.user.id,
          shop_id: body.shopId,
          role: "staff",
        });
        if (m.error) throw m.error;
      } catch (e) {
        await admin.from("account_status").delete().eq("user_id", data.user.id);
        await admin.auth.admin.deleteUser(data.user.id);
        throw e;
      }
      return Response.json(await issueCode(admin, data.user.id, user.id), {
        headers,
      });
    }
    throw new Error("Unknown action");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400, headers },
    );
  }
});
