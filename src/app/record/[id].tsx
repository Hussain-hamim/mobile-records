import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Button,
  Card,
  Field,
  Icon,
  SectionTitle,
  colors,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  errorText,
} from "../../components/ui";
import { PersonFields } from "../../components/person-fields";
import { printRecord } from "../../services/printing";
import type { FormPicture } from "../../services/form-image-types";
import { FormPicturePreview } from "../../components/form-picture-preview";
import { saveFormImage } from "../../services/form-image";
import { formatDate, formatMoney } from "../../domain/format";
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
  const [message, setMessage] = useState("");
  const [picture, setPicture] = useState<FormPicture | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
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
      <Button
        secondary
        icon="account-outline"
        label={t("viewCustomer")}
        onPress={() =>
          router.push({
            pathname: "/customer/[id]",
            params: { id: record.customerId },
          })
        }
      />
      <FormPicturePreview picture={picture} onClose={() => setPicture(null)} />
      <Notice message={error} tone="error" />
      <Notice message={message} />
      <Notice message={t("draftForm")} />
      <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
        <Row style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <View
            style={{
              backgroundColor: "#41455F",
              padding: 12,
              borderRadius: 16,
            }}
          >
            <Icon name="cellphone-check" color={colors.lime} size={29} />
          </View>
          <View>
            <Txt size={12} color="#D6DAEF">
              {t(record.direction === "buy" ? "bought" : "sold")}
            </Txt>
            <Txt size={11} color={colors.lime}>
              {app.demo ? t("demoMode") : t(op?.state ?? record.syncState)}
            </Txt>
          </View>
        </Row>
        <Txt bold size={26} color="#fff">
          {record.phone.brand} {record.phone.model}
        </Txt>
        <Txt size={30} bold color={colors.lime} style={{ marginTop: 8 }}>
          {formatMoney(record.price, app.language)}
        </Txt>
      </Card>
      <Card>
        <SectionTitle title={t("phoneDetails")} icon="cellphone" />
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
                <Txt
                  size={13}
                  style={
                    k.startsWith("imei")
                      ? { writingDirection: "ltr" }
                      : undefined
                  }
                >
                  {v}
                </Txt>
              </View>
            </Row>
          ))}
      </Card>
      <Card>
        <SectionTitle title={t("customerDetails")} icon="account-outline" />
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
      <View style={{ marginTop: 12 }}>
        <Button
          label={t("savePicture")}
          secondary
          icon="image-outline"
          loading={busy}
          onPress={() =>
            void run(async () => {
              const result = await saveFormImage(
                record,
                app.language,
                app.gregorian,
                undefined,
                setPicture,
              );
              if (result) setMessage(t(result));
            })
          }
        />
      </View>
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
                disabled={busy}
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
              <View style={{ marginTop: 8 }}>
                <Button
                  small
                  secondary
                  icon="image-outline"
                  label={t("savePicture")}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const result = await saveFormImage(
                        a.snapshot,
                        app.language,
                        app.gregorian,
                        a.reason,
                        setPicture,
                      );
                      if (result) setMessage(t(result));
                    })
                  }
                />
              </View>
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
