import { adminClient, json } from "../_shared/login-codes.ts";
import { photoUrl, verifyPhoto } from "../_shared/r2-photos.ts";
const allowed = new Set([
  "status",
  "request",
  "prepare",
  "complete",
  "list",
  "read",
  "remove",
  "failed",
]);
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json({});
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  try {
    const api = adminClient();
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const {
      data: { user },
      error,
    } = await api.auth.getUser(token);
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Invalid request" }, 400);
    const body = JSON.parse(raw);
    if (!allowed.has(body.action))
      return json({ error: "Invalid action" }, 400);
    const rpc = async (action: string) => {
      const result = await api.rpc("photo_service", {
        p_actor: user.id,
        p_action: action,
        p: body,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    if (body.action === "complete") {
      // Prepare is idempotent and validates the same identity, payload and grant.
      const p = await rpc("prepare");
      if (p.state !== "current") await verifyPhoto(p);
      return json(await rpc("complete"));
    }
    const result = await rpc(body.action);
    if (body.action === "prepare" && result.state === "pending")
      return json({
        photo: result,
        upload: await photoUrl(result, "PUT"),
        preview: await photoUrl(result, "PUT", true),
      });
    if (body.action === "prepare") return json({ photo: result });
    if (body.action === "read")
      return json({
        photo: result,
        ...(await photoUrl(result, "GET", body.preview === true)),
      });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe =
      /^(photo[A-Z]\w*|noAccess|conflict|recordVoided|changeReasonRequired)$/.test(
        message,
      )
        ? message
        : "photoCloudUnavailable";
    return json(
      { error: safe },
      safe === "noAccess" ? 403 : safe === "conflict" ? 409 : 400,
    );
  }
});
