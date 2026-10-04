import { useState } from "react";
import type { Customer, Person } from "../domain/models";
import { contactFields } from "../domain/edit-policy";
import { useApp } from "../state/app-context";
import { PersonFields } from "./person-fields";
import { Button, Card, Field, Notice, Txt, errorText } from "./ui";

export function CustomerEditor({ customer }: { customer: Customer }) {
  const app = useApp(),
    { t } = app;
  const [baseline, setBaseline] = useState<Customer | null>(null);
  const [person, setPerson] = useState<Person>(customer.person);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!baseline)
    return (
      <Button
        secondary
        icon="pencil-outline"
        label={t("editCustomer")}
        onPress={() => {
          setBaseline(customer);
          setPerson({ ...customer.person });
          setReason("");
          setError("");
        }}
      />
    );
  return (
    <Card>
      <Txt bold>{t("editCustomer")}</Txt>
      <Notice message={t("profileEditHint")} />
      {app.membership?.role === "owner" ? (
        <PersonFields value={person} onChange={setPerson} compact={false} />
      ) : (
        <>
          <Notice message={t("identityOwnerOnly")} />
          {contactFields.map((key) => (
            <Field
              key={key}
              label={t(key)}
              value={person[key] ?? ""}
              onChangeText={(value) => setPerson({ ...person, [key]: value })}
            />
          ))}
        </>
      )}
      <Field
        label={t("reason")}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
      />
      <Notice message={error} tone="error" />
      <Button
        label={t("confirmChanges")}
        loading={busy}
        disabled={busy || !reason.trim()}
        onPress={() => {
          setBusy(true);
          setError("");
          void app
            .saveCustomer(
              customer.id,
              person,
              reason,
              baseline.version,
              baseline.person,
            )
            .then(() => setBaseline(null))
            .catch((e) => setError(errorText(e, t)))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        secondary
        label={t("cancel")}
        disabled={busy}
        onPress={() => setBaseline(null)}
      />
    </Card>
  );
}
