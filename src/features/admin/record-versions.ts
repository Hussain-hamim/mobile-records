import type { AdminRecordDetail } from "./types";

/** Photo events retain the original snapshot, so must never replace a correction. */
export function recordVersions(detail: AdminRecordDetail) {
  const voided = detail.amendments.some((event) => event.kind === "void");
  return [
    {
      id: "original",
      label: "Original record",
      snapshot: detail.record,
      annotation: voided ? "VOIDED — original record" : undefined,
    },
    ...detail.amendments
      .filter((event) => !event.kind || event.kind === "correction")
      .map((event, index) => ({
        id: event.id,
        label: `Correction ${index + 1}`,
        snapshot: event.snapshot,
        annotation: `${voided ? "VOIDED — " : ""}Correction ${index + 1} · ${event.createdAt} · ${event.reason}`,
      })),
  ];
}
