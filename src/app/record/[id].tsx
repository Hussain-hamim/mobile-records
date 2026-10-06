import { fingerprintsOf } from "../../domain/fingerprints";
import type { ReceiptContext } from "../../domain/receipt-attachments";
import { RecordChanges } from "../../components/record-changes";
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Button,
  Chip,
  Card,
  Field,
  Icon,
  SectionTitle,
  Disclosure,
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
import { formatDate, formatAuditDate, formatMoney } from "../../domain/format";
import type { Transaction } from "../../domain/models";
import { RecordPhotos } from "../../components/record-photos";
export default function RecordDetail() {
  const app = useApp();
  const { t } = app;
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = app.records.find((r) => r.id === id);
  const corrections = app.amendments
    .filter((a) => a.recordId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [editBase, setEditBase] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const voided = corrections.some((a) => a.kind === "void");
  const latestId = corrections.at(-1)?.id ?? null;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [picture, setPicture] = useState<FormPicture | null>(null);
  const [originalLayout, setOriginalLayout] = useState(false);
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
  function receiptContext(snapshot: Transaction): ReceiptContext | undefined {
    if (!app.membership) return undefined;
    const customer = app.customers.find((c) => c.id === snapshot.customerId);
    return {
      shopId: app.membership.shopId,
      userId: app.membership.userId,
      originalLayout,
      fingerprintEnrolled: customer
        ? fingerprintsOf(customer).length > 0
        : undefined,
    };
  }
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
      {originalLayout ? <Notice message={t("draftForm")} /> : null}
      {voided ? <Notice message={t("recordVoided")} tone="error" /> : null}
      <Txt muted size={12}>
        {t("originalRecord")}
      </Txt>
      <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
        <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <View
            style={{
              backgroundColor: "#FFFFFF18",
              padding: 12,
              borderRadius: 16,
            }}
          >
            <Icon name="cellphone-check" color={colors.lime} size={29} />
          </View>
          <View>
            <Txt size={12} color={colors.lime}>
              {t(record.direction === "buy" ? "bought" : "sold")}
            </Txt>
            <Txt size={11} color={colors.lime}>
              {app.demo ? t("demoMode") : t(op?.state ?? record.syncState)}
            </Txt>
          </View>
        </Row>
        <Txt bold size={22} color="#fff">
          {record.phone.brand} {record.phone.model}
        </Txt>
        <Txt size={24} bold color={colors.lime} style={{ marginTop: 8 }}>
          {formatMoney(record.price, app.language)}
        </Txt>
      </Card>
      <Card>
        <Disclosure title={t("phoneDetails")} icon="cellphone">
          {Object.entries(record.phone)
            .filter(([k, v]) => v && k !== "brand" && k !== "model")
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
        </Disclosure>
      </Card>
      <Card>
        <SectionTitle title={t("customerDetails")} icon="account-outline" />
        <RecordPhotos
          recordId={record.id}
          direction={record.direction}
          editable={app.membership?.role === "owner" && !voided}
          savedRecord={record}
        />
        <Txt bold>{record.customer.name}</Txt>
        <Txt muted style={{ writingDirection: "ltr" }}>{record.customer.phone}</Txt>
        <Disclosure title={t("moreDetails")} icon="account-details-outline">
          {Object.entries(record.customer)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <View key={k} style={{ marginTop: 8 }}>
                <Txt muted size={11}>
                  {t(k as keyof typeof record.customer)}
                </Txt>
                <Txt size={14}>
                  {k === "idType" ? t(v === "pnid" ? "pnid" : "enid") : v}
                </Txt>
              </View>
            ))}
        </Disclosure>
      </Card>
      <Row style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <Chip
          label={t("pashtoForm")}
          active={!originalLayout}
          onPress={() => setOriginalLayout(false)}
        />
        <Chip
          label={t("originalFormLayout")}
          active={originalLayout}
          onPress={() => setOriginalLayout(true)}
        />
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Button
            label={t("print")}
            icon="printer-outline"
            loading={busy}
            onPress={() =>
              void run(() =>
                printRecord(
                  record,
                  app.language,
                  app.gregorian,
                  false,
                  voided ? t("recordVoided") : undefined,
                  receiptContext(record),
                ),
              )
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
              printRecord(
                record,
                app.language,
                app.gregorian,
                true,
                voided ? t("recordVoided") : undefined,
                receiptContext(record),
              ),
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
                voided ? t("recordVoided") : undefined,
                setPicture,
                receiptContext(record),
              );
              if (result) setMessage(t(result));
            })
          }
        />
      </View>
      <View style={{ height: 22 }} />
      {corrections.length ? (
        <Card>
          <Disclosure title={t("amendments")} icon="history">
            {corrections.map((a, index) => (
              <View key={a.id} style={{ marginTop: 15 }}>
                <Txt bold>
                  {t(
                    a.kind === "void"
                      ? "recordVoided"
                      : a.kind === "photo"
                        ? "photoChange"
                        : "correction",
                  )}
                </Txt>
                <Txt>{a.reason}</Txt>
                {!a.kind || a.kind === "correction" ? (
                  <RecordChanges
                    before={
                      corrections
                        .slice(0, index)
                        .filter((c) => !c.kind || c.kind === "correction")
                        .at(-1)?.snapshot ?? record
                    }
                    after={a.snapshot}
                  />
                ) : null}
                <Txt muted size={12}>
                  {t("changedBy")}: {a.createdBy}
                </Txt>
                {a.kind === "photo" && a.photoChange ? (
                  <Txt size={12}>
                    {t(
                      a.photoChange.slot === "person"
                        ? "sellerPhoto"
                        : "idFrontPhoto",
                    )}{" "}
                    ·{" "}
                    {t(
                      a.photoChange.action === "remove"
                        ? "removePhoto"
                        : a.photoChange.action === "adjust"
                          ? "adjustView"
                          : "replacePhoto",
                    )}
                  </Txt>
                ) : null}
                <Txt muted size={11}>
                  {formatAuditDate(a.createdAt, app.language, app.gregorian)}
                </Txt>
                {!a.kind || a.kind === "correction" ? (
                  <>
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
                            voided
                              ? `${t("recordVoided")} · ${a.reason}`
                              : a.reason,
                            receiptContext(a.snapshot),
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
                              voided
                                ? `${t("recordVoided")} · ${a.reason}`
                                : a.reason,
                              setPicture,
                              receiptContext(a.snapshot),
                            );
                            if (result) setMessage(t(result));
                          })
                        }
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </Disclosure>
        </Card>
      ) : null}
      {app.membership?.role === "owner" && !edit && !voided && !voiding ? (
        <Button
          secondary
          label={t("amend")}
          onPress={() => {
            setEditBase(latestId);
            setEdit(
              JSON.parse(
                JSON.stringify(
                  corrections
                    .filter((a) => !a.kind || a.kind === "correction")
                    .at(-1)?.snapshot ?? record,
                ),
              ) as Transaction,
            );
          }}
        />
      ) : null}
      {app.membership?.role === "owner" && !voided && !edit ? (
        voiding ? (
          <Card>
            <Notice message={t("voidHint")} />
            <Field
              label={t("reason")}
              value={reason}
              onChangeText={setReason}
              maxLength={500}
            />
            <Button
              label={t("confirmVoid")}
              loading={busy}
              disabled={busy || !reason.trim()}
              onPress={() =>
                void run(async () => {
                  await app.amend(record, reason, editBase, "void");
                  setVoiding(false);
                  setReason("");
                })
              }
            />
            <Button
              secondary
              label={t("cancel")}
              disabled={busy}
              onPress={() => setVoiding(false)}
            />
          </Card>
        ) : (
          <Button
            secondary
            icon="cancel"
            label={t("voidRecord")}
            onPress={() => {
              setEditBase(latestId);
              setReason("");
              setVoiding(true);
            }}
          />
        )
      ) : null}
      {edit ? (
        <Card>
          <Field label={t("reason")} value={reason} onChangeText={setReason} />
          <Row style={{ marginBottom: 16 }}>
            {(["buy", "sell"] as const).map((direction) => (
              <Chip
                key={direction}
                label={t(direction)}
                active={edit.direction === direction}
                onPress={() => setEdit({ ...edit, direction })}
              />
            ))}
          </Row>
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
                await app.amend(edit, reason, editBase);
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
