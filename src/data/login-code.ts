import { FunctionsHttpError } from "@supabase/supabase-js";
import { backend } from "./backend";
import { digits } from "../domain/validation";
export async function redeemLoginCode(phone: string, input: string) {
  if (!backend) throw new Error("setup");
  const code = digits(input).replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(code)) throw new Error("invalidLoginCode");
  const { data, error } = await backend.functions.invoke("redeem-login-code", {
    body: { phone, code },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => ({}));
      const allowed = [
        "invalidLoginCode",
        "loginUnavailable",
        "loginCodeExchangeFailed",
      ];
      throw new Error(
        allowed.includes(detail.error) ? detail.error : "loginUnavailable",
      );
    }
    throw new Error("loginUnavailable");
  }
  if (!data?.session?.access_token || !data.session.refresh_token)
    throw new Error("loginUnavailable");
  const result = await backend.auth.setSession(data.session);
  if (result.error) throw new Error("loginUnavailable");
}
