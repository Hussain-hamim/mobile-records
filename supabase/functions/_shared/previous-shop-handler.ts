export type PreviousShopDependencies = {
  authenticate: (token: string) => Promise<string | null>;
  call: (
    rpc: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

export function previousShopHandler(deps: PreviousShopDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return json({});
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    try {
      const token = request.headers
        .get("Authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return json({ error: "noAccess" }, 401);
      const actor = await deps.authenticate(token);
      if (!actor) return json({ error: "noAccess" }, 401);
      const raw = await request.text();
      if (raw.length > 2048) return json({ error: "Invalid request" }, 400);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "Invalid request" }, 400);
      let rpc: string, args: Record<string, unknown>;
      if (body.action === "admin-status" || body.action === "admin-set") {
        if (
          body.action === "admin-set" &&
          (typeof body.enabled !== "boolean" ||
            !Number.isSafeInteger(body.version) ||
            body.version < 1)
        )
          return json({ error: "Invalid request" }, 400);
        rpc = "previous_shop_admin";
        args = {
          p_actor: actor,
          p_enabled: body.action === "admin-set" ? body.enabled : null,
          p_version: body.action === "admin-set" ? body.version : null,
        };
      } else if (body.action === "status" || body.action === "lookup") {
        if (typeof body.shopId !== "string" || !uuid.test(body.shopId))
          return json({ error: "noAccess" }, 403);
        let imeis: string[] | null = null;
        if (body.action === "lookup") {
          if (
            !Array.isArray(body.imeis) ||
            body.imeis.length < 1 ||
            body.imeis.length > 2 ||
            body.imeis.some(
              (v: unknown) => typeof v !== "string" || !/^\d{15}$/.test(v),
            )
          )
            return json({ error: "invalidImei" }, 400);
          imeis = [...new Set<string>(body.imeis)];
        }
        rpc = "previous_shop_lookup";
        args = { p_actor: actor, p_shop: body.shopId, p_imeis: imeis };
      } else return json({ error: "Invalid request" }, 400);
      const { data, error } = await deps.call(rpc, args);
      if (error) return json({ error: "previousShopUnavailable" }, 503);
      const problem = (data as { error?: string } | null)?.error;
      if (problem)
        return json(
          { error: problem },
          problem === "noAccess"
            ? 403
            : problem === "conflict"
              ? 409
              : problem === "previousShopRateLimited"
                ? 429
                : 400,
        );
      return json(data);
    } catch {
      return json({ error: "previousShopUnavailable" }, 503);
    }
  };
}
