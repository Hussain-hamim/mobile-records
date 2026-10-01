import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const headers = { "Content-Type": "application/json" };
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
    if (body.action === "password") {
      if (typeof body.password !== "string" || body.password.length < 12)
        throw new Error("Password requires 12 characters");
      const updated = await admin.auth.admin.updateUserById(user.id, {
        password: body.password,
      });
      if (updated.error) throw updated.error;
      const status = await admin
        .from("account_status")
        .update({ must_change_password: false })
        .eq("user_id", user.id);
      if (status.error) throw status.error;
      return Response.json({ ok: true }, { headers });
    }
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
      const password = crypto.randomUUID() + "aA!";
      const { data, error } = await admin.auth.admin.createUser({
        phone: body.phone,
        password,
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
        const m = await admin
          .from("memberships")
          .insert({
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
      return Response.json({ password }, { headers });
    }
    throw new Error("Unknown action");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400, headers },
    );
  }
});
