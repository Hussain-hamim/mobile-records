import * as Crypto from "expo-crypto";
import { backend } from "../data/backend";
import { scanUpload } from "./scanning";
import { readAfghanMrz, type MrzResult } from "../domain/mrz";
const knownErrors = new Set([
  "onlineNotConfigured",
  "onlineQuotaReached",
  "onlineRateLimited",
  "duplicateScan",
  "scanTooLarge",
  "noAccess",
  "invalidScan",
  "onlineTimedOut",
]);
async function request(body: Record<string, unknown>, signal: AbortSignal) {
  if (!backend) throw Error("onlineNotConfigured");
  const {
    data: { session },
  } = await backend.auth.getSession();
  if (!session) throw Error("noAccess");
  if (signal.aborted) throw Error("scanCancelled");
  // Dedicated fetch preserves cancellation and the 25s OCR timeout; the shared
  // backend fetch currently enforces a separate 15s sync timeout.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 25000);
  try {
    const response = await fetch(
      process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/read-tazkira",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw Error(
        knownErrors.has(data.error) ? data.error : "onlineReadFailed",
      );
    return data;
  } catch (error) {
    if (controller.signal.aborted)
      throw Error(signal.aborted ? "scanCancelled" : "onlineTimedOut");
    throw error instanceof Error && knownErrors.has(error.message)
      ? error
      : Error("onlineReadFailed");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
export async function onlineScanAvailable(
  shopId: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    return (
      (await request({ action: "status", shopId }, signal)).enabled === true
    );
  } catch {
    return false;
  }
}
export async function recognizeMrzOnline(
  uri: string,
  shopId: string,
  signal: AbortSignal,
): Promise<MrzResult> {
  const image = await scanUpload(uri);
  if (signal.aborted) throw Error("scanCancelled");
  const { document } = (await request(
    {
      action: "read",
      mode: "mrz",
      requestId: Crypto.randomUUID(),
      shopId,
      language: "en",
      image,
    },
    signal,
  )) as { document: { text: string } };
  // Online text must pass exactly the same MRZ checks as offline text.
  // Printed labels and arbitrary returned fields are never applied.
  return readAfghanMrz([document.text]);
}
