import type {
  Customer,
  Draft,
  FingerprintEntry,
  FingerprintSkip,
  FingerprintAudit,
  Membership,
} from "./models";

export function fingerprintsOf(
  customer?: Pick<
    Customer,
    "id" | "fingerprints" | "fingerprintTemplate"
  > | null,
): FingerprintEntry[] {
  if (!customer) return [];
  if (customer.fingerprints !== undefined) return customer.fingerprints;
  return customer.fingerprintTemplate?.trim()
    ? [
        {
          id: `legacy-${customer.id}`,
          slot: "primary",
          template: customer.fingerprintTemplate,
          enrolledAt: null,
          enrolledBy: null,
        },
      ]
    : [];
}

export function scanTemplates(customers: Customer[]) {
  return customers.flatMap((customer) =>
    fingerprintsOf(customer).map((finger) => ({
      id: finger.id,
      customerId: customer.id,
      template: finger.template,
    })),
  );
}

export function validFingerprintSkip(skip?: FingerprintSkip) {
  return (
    !!skip &&
    [
      "readerUnavailable",
      "customerUnable",
      "customerDeclined",
      "otherReason",
    ].includes(skip.reason) &&
    skip.note.length <= 500 &&
    (skip.reason !== "otherReason" || !!skip.note.trim())
  );
}

export function draftFingerprints(draft: Draft, customer?: Customer | null) {
  const saved = fingerprintsOf(customer);
  // Drafts carry new enrollments only. Never resurrect removed stored fingers from a stale draft.
  const added =
    draft.fingerprints ??
    (!customer && draft.fingerprintTemplate
      ? fingerprintsOf({
          id: draft.customerId || draft.id,
          fingerprintTemplate: draft.fingerprintTemplate,
        })
      : []);
  return [
    ...saved,
    ...added.filter((f) => !saved.some((s) => s.slot === f.slot)),
  ];
}

export function fingerprintChanges(
  before: FingerprintEntry[],
  after: FingerprintEntry[],
  member: Membership,
  reason: string,
  now: string,
): FingerprintAudit[] {
  if (
    after.length > 2 ||
    new Set(after.map((f) => f.slot)).size !== after.length ||
    new Set(after.map((f) => f.id)).size !== after.length ||
    after.some(
      (f) =>
        !["primary", "backup"].includes(f.slot) ||
        !f.id ||
        f.id.length > 100 ||
        !f.template.trim() ||
        f.template.length > 8192,
    )
  )
    throw new Error("fingerprintInvalid");
  const changes: FingerprintAudit[] = [];
  for (const slot of ["primary", "backup"] as const) {
    const old = before.find((f) => f.slot === slot),
      next = after.find((f) => f.slot === slot);
    if (
      (!old && !next) ||
      (old &&
        next &&
        old.id === next.id &&
        old.slot === next.slot &&
        old.template === next.template &&
        old.enrolledBy === next.enrolledBy &&
        old.enrolledAt === next.enrolledAt)
    )
      continue;
    if (old && member.role !== "owner") throw new Error("fingerprintOwnerOnly");
    if (old && !reason.trim()) throw new Error("fingerprintReasonRequired");
    if (reason.length > 500) throw new Error("fingerprintInvalid");
    if (next && (next.enrolledBy !== member.userId || !next.enrolledAt))
      throw new Error("fingerprintInvalid");
    changes.push({
      slot,
      action: !old ? "add" : !next ? "remove" : "replace",
      reason: reason.trim(),
      at: now,
      by: member.userId,
    });
  }
  return changes;
}

export function customerFromRow(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    person: row.person as Customer["person"],
    version: Number(row.version),
    ...(Array.isArray(row.fingerprints)
      ? { fingerprints: row.fingerprints as FingerprintEntry[] }
      : typeof row.fingerprint_template === "string"
        ? { fingerprintTemplate: row.fingerprint_template }
        : {}),
    fingerprintAudit: Array.isArray(row.fingerprint_audit)
      ? (row.fingerprint_audit as FingerprintAudit[])
      : [],
  };
}
