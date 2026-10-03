import type { Phone, Transaction } from "./models";
import { normalizeImei, validImei } from "./validation";

const reusableFields = [
  "brand",
  "model",
  "color",
  "simCount",
  "storage",
  "ram",
] as const;
export type PhoneSuggestions = Partial<
  Pick<Phone, (typeof reusableFields)[number]>
>;
export async function resolvePhoneSuggestions(
  value: string,
  records: readonly Pick<Transaction, "phone" | "occurredAt">[],
  lookupTac: (imei: string) => Promise<{ brand: string; model: string } | null>,
): Promise<PhoneSuggestions | null> {
  const imei = normalizeImei(value);
  if (!validImei(imei)) throw new Error("invalidImei");
  const previous = records
    .filter((record) =>
      [record.phone.imei1, record.phone.imei2].some(
        (v) => normalizeImei(v) === imei,
      ),
    )
    .reduce<Pick<Transaction, "phone" | "occurredAt"> | undefined>(
      (latest, record) =>
        !latest || record.occurredAt > latest.occurredAt ? record : latest,
      undefined,
    );
  if (previous) {
    const suggestions: PhoneSuggestions = {};
    for (const key of reusableFields) {
      if (previous.phone[key].trim()) suggestions[key] = previous.phone[key];
    }
    if (Object.keys(suggestions).length) return suggestions;
  }
  // A TAC identifies a device type, not the unit's colour, memory or condition.
  const found = await lookupTac(imei);
  if (!found) return null;
  return { brand: found.brand, model: found.model };
}

export function applyPhoneSuggestions(
  current: Phone,
  baseline: Phone,
  suggestions: PhoneSuggestions,
  target: "imei1" | "imei2",
  imei: string,
): Phone {
  if (normalizeImei(current[target]) !== imei) return current;
  const next = { ...current };
  for (const key of reusableFields) {
    // Preserve edits made while lookup was running; a secondary scan fills gaps.
    if (
      suggestions[key]?.trim() &&
      current[key] === baseline[key] &&
      (target === "imei1" || !current[key].trim())
    )
      next[key] = suggestions[key]!;
  }
  return next;
}
