import {
  adminClient,
  findUserByPhone,
  issueCode,
  readActiveCode,
  json,
} from "../_shared/login-codes.ts";
import { normalizeLoginPhone } from "../_shared/login-code-core.ts";
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  try {
    const admin = adminClient();
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    let actorId: string | null = null;
    // Trusted CLI only. The browser portal must use an authenticated user
    // listed in private.platform_administrators, never a service-role key.
    if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token);
      if (error || !user) return json({ error: "Unauthorized" }, 401);
      const permission = await admin.rpc("is_platform_administrator", {
        p_user: user.id,
      });
      if (permission.error || permission.data !== true)
        return json({ error: "noAccess" }, 403);
      actorId = user.id;
    }
    const body = await request.json();
    if (body.action === "overview") {
      const result = await admin.rpc("admin_overview");
      if (result.error) return json({ error: "Could not load overview" }, 500);
      return json(result.data);
    }
    if (body.action === "list-shops") {
      const page =
        Number.isInteger(body.page) && body.page >= 0
          ? Math.min(body.page, 100000)
          : 0;
      const search =
        typeof body.search === "string" ? body.search.trim().slice(0, 100) : "";
      let query = admin
        .from("shops")
        .select("id,profile,version,memberships(user_id,role,active)", {
          count: "exact",
        })
        .order("id")
        .range(page * 20, page * 20 + 19);
      if (search)
        query = query.ilike(
          "profile->>shopName",
          "%" + search.replace(/[\\%_]/g, (c) => "\\" + c) + "%",
        );
      const result = await query;
      if (result.error) return json({ error: "Could not load shops" }, 500);
      return json({
        shops: result.data.map((s) => ({
          id: s.id,
          name: s.profile.shopName ?? "Unnamed shop",
          address: s.profile.address ?? "",
          members: s.memberships.length,
          activeMembers: s.memberships.filter((m) => m.active).length,
        })),
        total: result.count ?? 0,
      });
    }
    if (body.action === "shop-detail") {
      const shop = await admin
        .from("shops")
        .select("id,profile")
        .eq("id", body.shopId)
        .single();
      if (shop.error) return json({ error: "Shop not found" }, 404);
      const members = [];
      for (let offset = 0; ; offset += 100) {
        const result = await admin
          .from("memberships")
          .select("user_id,role,active")
          .eq("shop_id", body.shopId)
          .order("user_id")
          .range(offset, offset + 99);
        if (result.error)
          return json({ error: "Could not load accounts" }, 500);
        for (const member of result.data) {
          const account = await admin.auth.admin.getUserById(member.user_id);
          const status = await admin
            .from("account_status")
            .select("must_change_password")
            .eq("user_id", member.user_id)
            .maybeSingle();
          if (account.error || status.error)
            return json({ error: "Could not load account details" }, 500);
          members.push({
            ...member,
            phone: account.data.user?.phone
              ? "+" + account.data.user.phone.replace(/^\+/, "")
              : "",
            activated: status.data?.must_change_password === false,
          });
        }
        if (result.data.length < 100) break;
      }
      const records = await admin
        .from("records")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", body.shopId);
      if (records.error)
        return json({ error: "Could not load record count" }, 500);
      return json({
        shop: shop.data,
        members,
        recordCount: records.count ?? 0,
      });
    }
    if (body.action === "set-access") {
      if (
        typeof body.active !== "boolean" ||
        typeof body.reason !== "string" ||
        !body.reason.trim()
      )
        return json({ error: "A reason is required" }, 400);
      const result = await admin.rpc("admin_set_access", {
        p_shop: body.shopId,
        p_user: body.userId,
        p_active: body.active,
        p_reason: body.reason,
        p_actor: actorId,
      });
      if (result.error) return json({ error: "Could not change access" }, 400);
      return json({ ok: true });
    }
    const phone = normalizeLoginPhone(body.phone);
    if (body.action === "view-code") {
      const user = await findUserByPhone(admin, phone);
      if (!user) return json({ error: "Account not found" }, 404);
      return json(await readActiveCode(admin, user.id));
    }
    if (body.action === "issue-code") {
      const user = await findUserByPhone(admin, phone);
      if (!user) return json({ error: "Account not found" }, 404);
      return json(await issueCode(admin, user.id, actorId));
    }
    if (
      body.action !== "onboard" ||
      typeof body.shopName !== "string" ||
      !body.shopName.trim() ||
      body.shopName.length > 160
    )
      return json({ error: "Invalid action or shop name" }, 400);
    const { data, error } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
    });
    if (error || !data.user)
      return json(
        { error: "Account already exists or could not be created" },
        409,
      );
    const userId = data.user.id,
      shopId = crypto.randomUUID();
    try {
      for (const [table, row] of [
        ["account_status", { user_id: userId, must_change_password: true }],
        ["shops", { id: shopId, profile: { shopName: body.shopName.trim() } }],
        ["memberships", { shop_id: shopId, user_id: userId, role: "owner" }],
      ] as const) {
        const result = await admin.from(table).insert(row);
        if (result.error) throw new Error("Provisioning incomplete");
      }
    } catch {
      await admin.from("memberships").delete().eq("user_id", userId);
      await admin.from("shops").delete().eq("id", shopId);
      await admin.from("account_status").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
      return json({ error: "Could not provision account" }, 500);
    }
    return json({
      userId,
      shopId,
      ...(await issueCode(admin, userId, actorId)),
    });
  } catch {
    return json({ error: "Account operation failed" }, 400);
  }
});
