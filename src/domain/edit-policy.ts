import type { Amendment, Membership, Person, ProfileAudit } from "./models";

export const contactFields: (keyof Person)[] = [
  "phone",
  "relativePhone",
  "originalAddress",
  "currentAddress",
  "occupation",
  "workplace",
];
export function profileChanges(
  before: Person,
  after: Person,
  member: Membership,
  reason: string,
  at: string,
): ProfileAudit | null {
  const changes: ProfileAudit["changes"] = {};
  for (const key of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]) as Set<keyof Person>) {
    const oldValue = before[key] ?? (key === "idType" ? "enid" : "");
    const newValue = after[key] ?? (key === "idType" ? "enid" : "");
    if (oldValue === newValue) continue;
    if (!contactFields.includes(key) && member.role !== "owner")
      throw new Error("identityOwnerOnly");
    changes[key] = { before: oldValue, after: newValue };
  }
  if (!Object.keys(changes).length) return null;
  if (!reason.trim() || reason.length > 500)
    throw new Error("changeReasonRequired");
  return { changes, by: member.userId, at, reason: reason.trim() };
}
export function latestAmendment(amendments: Amendment[], recordId: string) {
  return amendments
    .filter((a) => a.recordId === recordId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}
export function isVoided(amendments: Amendment[], recordId: string) {
  return amendments.some((a) => a.recordId === recordId && a.kind === "void");
}

/** JSON objects from Postgres may have a different property order than UI objects. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.keys(a)
    .filter((k) => (a as Record<string, unknown>)[k] !== undefined)
    .sort();
  const right = Object.keys(b)
    .filter((k) => (b as Record<string, unknown>)[k] !== undefined)
    .sort();
  return (
    left.length === right.length &&
    left.every(
      (k, i) =>
        k === right[i] &&
        sameData(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
    )
  );
}
