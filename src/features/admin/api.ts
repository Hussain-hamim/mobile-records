import {
  createClient,
  FunctionsHttpError,
  type SupabaseClient,
} from "@supabase/supabase-js";
let client: SupabaseClient | null = null;
export function adminApi() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
    key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("The admin portal is not connected to Supabase.");
  if (!client)
    client = createClient(url, key, {
      auth: {
        storageKey: "radefy-platform-admin",
        storage:
          typeof window !== "undefined" ? window.sessionStorage : undefined,
        persistSession: typeof window !== "undefined",
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  return client;
}
export async function adminRequest<T>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await adminApi().functions.invoke("admin-accounts", {
    body: { action, ...body },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      if (error.context.status === 401 || error.context.status === 403)
        throw new Error(
          "This account does not have administrator access. Sign out and use your admin account.",
        );
      const detail = await error.context.json().catch(() => ({}));
      throw new Error(
        typeof detail.error === "string"
          ? detail.error
          : "The request could not be completed.",
      );
    }
    throw new Error(
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
