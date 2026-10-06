import { adminClient, json } from "../_shared/login-codes.ts";
import { deletePhoto } from "../_shared/r2-photos.ts";
Deno.serve(async (request) => {
  const secret = Deno.env.get("PHOTO_CLEANUP_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`)
    return json({ error: "Unauthorized" }, 401);
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const api = adminClient();
  let deleted = 0,
    failed = 0;
  const { data, error } = await api.rpc("photo_cleanup", {});
  if (error) return json({ error: "photoCleanupFailed" }, 500);
  for (const photo of data ?? []) {
    try {
      await deletePhoto(photo);
      const ack = await api.rpc("photo_cleanup", { p_id: photo.id });
      if (ack.error) throw ack.error;
      deleted++;
    } catch {
      failed++;
    }
  }
  const reconciled = await api.rpc("photo_reconcile", {});
  if (reconciled.error) failed++;
  return json(
    { deleted, failed, reconciled: reconciled.data ?? 0 },
    failed ? 503 : 200,
  );
});
