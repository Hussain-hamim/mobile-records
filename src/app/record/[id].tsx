import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  errorText,
} from "../../components/ui";
import { PersonFields } from "../../components/person-fields";
import { printRecord } from "../../services/printing";
import { formatDate } from "../../domain/format";
import type { Transaction } from "../../domain/models";
export default function RecordDetail() {
  const app = useApp();
  const { t } = app;
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = app.records.find((r) => r.id === id);
  const corrections = app.amendments
    .filter((a) => a.recordId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  if (!record)
    return (
      <Screen>
        <Button label={t("back")} onPress={() => router.back()} />
      </Screen>
    );
  const op = app.operations.find(
    (o) => o.kind === "record" && (o.payload as Transaction).id === record.id,
  );
  return (
    <Screen>
      <Heading
        title={record.reference}
        subtitle={formatDate(record.occurredAt, app.language, app.gregorian)}
        action={
          <Button
            small
            secondary
            label={t("back")}
            onPress={() => router.back()}
          />
        }
      />
      <Notice message={error} tone="error" />
      <Notice message={t("draftForm")} />
      <Card>
        <Txt muted>
          {t(record.direction === "buy" ? "bought" : "sold")} ·{" "}
          {t(op?.state ?? record.syncState)}
        </Txt>
        <Txt bold size={27}>
          {record.phone.brand} {record.phone.model}
        </Txt>
        <Txt size={23} bold>
          {record.price} AFN
        </Txt>
        {Object.entries(record.phone)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Row
              key={k}
              style={{ justifyContent: "space-between", marginTop: 9 }}
            >
              <Txt size={12} muted>
                {t(k as keyof typeof record.phone)}
              </Txt>
              <View style={{ flex: 1 }}>
                <Txt size={13}>{v}</Txt>
              </View>
            </Row>
          ))}
      </Card>
      <Card>
        <Txt bold>{t("customerDetails")}</Txt>
        {Object.entries(record.customer)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <View key={k} style={{ marginTop: 8 }}>
              <Txt muted size={11}>
                {t(k as keyof typeof record.customer)}
              </Txt>
              <Txt size={14}>{v}</Txt>
            </View>
          ))}
      </Card>
      <Row>
        <View style={{ flex: 1 }}>
          <Button
            label={t("print")}
            icon="printer-outline"
            loading={busy}
            onPress={() =>
              void run(() => printRecord(record, app.language, app.gregorian))
            }
          />
        </View>
        <Button
          label={t("share")}
          secondary
          icon="share-variant-outline"
          loading={busy}
          onPress={() =>
            void run(() =>
              printRecord(record, app.language, app.gregorian, true),
            )
          }
        />
      </Row>
      <View style={{ height: 22 }} />
      {corrections.length ? (
        <Card>
          <Txt bold>{t("amendments")}</Txt>
          {corrections.map((a) => (
            <View key={a.id} style={{ marginTop: 15 }}>
              <Txt>{a.reason}</Txt>
              <Txt muted size={11}>
                {formatDate(a.createdAt, app.language, app.gregorian)}
              </Txt>
              <Button
                small
                secondary
                label={t("print")}
                onPress={() =>
                  void run(() =>
                    printRecord(
                      a.snapshot,
                      app.language,
                      app.gregorian,
                      false,
                      a.reason,
                    ),
                  )
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
      {app.membership?.role === "owner" && !edit ? (
        <Button
          secondary
          label={t("amend")}
          onPress={() =>
            setEdit(
              JSON.parse(
                JSON.stringify(corrections.at(-1)?.snapshot ?? record),
              ) as Transaction,
            )
          }
        />
      ) : null}
      {edit ? (
        <Card>
          <Field label={t("reason")} value={reason} onChangeText={setReason} />
          <PersonFields
            value={edit.customer}
            onChange={(customer) => setEdit({ ...edit, customer })}
          />
          {Object.entries(edit.phone).map(([k, v]) => (
            <Field
              key={k}
              label={t(k as keyof typeof edit.phone)}
              value={v}
              onChangeText={(value) =>
                setEdit({ ...edit, phone: { ...edit.phone, [k]: value } })
              }
            />
          ))}
          <Field
            label={t("price")}
            value={edit.price}
            onChangeText={(price) => setEdit({ ...edit, price })}
            numeric
          />
          <Button
            label={t("save")}
            loading={busy}
            onPress={() =>
              void run(async () => {
                await app.amend(edit, reason);
                setEdit(null);
                setReason("");
              })
            }
          />
          <Button label={t("cancel")} secondary onPress={() => setEdit(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}
