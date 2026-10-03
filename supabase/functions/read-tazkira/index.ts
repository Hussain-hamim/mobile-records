import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createHandler, normalizeVision } from "./core.ts";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const key = Deno.env.get("GOOGLE_VISION_API_KEY");
Deno.serve(
  createHandler({
    enabled: Deno.env.get("TAZKIRA_ONLINE_ENABLED") === "true" && !!key,
    async authenticate(token, shopId) {
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token);
      if (error || !user || user.is_anonymous) return null;
      const [membership, status] = await Promise.all([
        admin
          .from("memberships")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("shop_id", shopId)
          .eq("active", true)
          .maybeSingle(),
        admin
          .from("account_status")
          .select("must_change_password")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      return !membership.error &&
        membership.data &&
        !status.error &&
        status.data?.must_change_password === false
        ? user.id
        : null;
    },
    async reserve(requestId, userId, shopId) {
      const { data, error } = await admin.rpc("reserve_tazkira_ocr", {
        p_request_id: requestId,
        p_user_id: userId,
        p_shop_id: shopId,
      });
      if (error) throw Error("onlineReadFailed");
      return data;
    },
    async recognize(image, _language, signal) {
      const response = await fetch(
        "https://vision.googleapis.com/v1/images:annotate",
        {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key!,
          },
          body: JSON.stringify({
            requests: [
              {
                image: { content: image },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                imageContext: {
                  languageHints: ["en"],
                },
              },
            ],
          }),
        },
      );
      if (!response.ok) throw Error("onlineReadFailed");
      return normalizeVision(await response.json());
    },
  }),
);
