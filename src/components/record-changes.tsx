import type { Transaction } from "../domain/models";
import type { TextKey } from "../i18n/strings";
import { useApp } from "../state/app-context";
import { Txt } from "./ui";

export function RecordChanges({
  before,
  after,
}: {
  before: Transaction;
  after: Transaction;
}) {
  const { t } = useApp();
  const changes: {
    key: string;
    label: string;
    before: string;
    after: string;
  }[] = [];
  for (const group of ["phone", "customer", "shop"] as const) {
    const a = before[group],
      b = after[group];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const oldValue = (a as unknown as Record<string, string>)[key] ?? "";
      const newValue = (b as unknown as Record<string, string>)[key] ?? "";
      if (oldValue !== newValue)
        changes.push({
          key: group + key,
          label: t(key as TextKey),
          before: oldValue,
          after: newValue,
        });
    }
  }
  if (before.price !== after.price)
    changes.push({
      key: "price",
      label: t("price"),
      before: before.price,
      after: after.price,
    });
  if (before.direction !== after.direction)
    changes.push({
      key: "direction",
      label: t("newRecord"),
      before: t(before.direction),
      after: t(after.direction),
    });
  return (
    <>
      {changes.map((c) => (
        <Txt key={c.key} size={12}>
          {c.label}: {c.before || "—"} → {c.after || "—"}
        </Txt>
      ))}
    </>
  );
}
