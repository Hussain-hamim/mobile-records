import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { previousShopHandler } from "../_shared/previous-shop-handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
// Custom JWT validation supports the project's asymmetric signing keys. No
// caller-supplied actor ID or service-role bearer is accepted as a user session.
Deno.serve(
  previousShopHandler({
    authenticate: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return !error && data.user && !data.user.is_anonymous
        ? data.user.id
        : null;
    },
    call: async (rpc, args) => await admin.rpc(rpc, args),
  }),
);
