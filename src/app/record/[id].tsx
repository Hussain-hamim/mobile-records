import { useShopQuery } from "../../state/use-shop-query";
import { PageFeedback } from "../../components/page-feedback";
import { RecordDetailSkeleton } from "../../components/record-detail-skeleton";
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
import { formatDate, formatAuditDate } from "../../domain/format";
import type { Transaction } from "../../domain/models";
import { RecordPhotos } from "../../components/record-photos";
import {
  RecordDetailSummary,
  RecordDetailField,
} from "../../components/record-detail-summary";
import { PreviousShop } from "../../components/previous-shop";
export default function RecordDetail() {
  const app = useApp();
  const { t } = app;
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useShopQuery(
    () => app.queries!.record(id),
    `${app.membership?.shopId}:${app.dataVersion}:${id}`,
    !!app.queries && !!id,
  );
  const record = detail.value?.record;
  const corrections = (detail.value?.amendments ?? [])
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
  if (!record && detail.loading)
    return <RecordDetailSkeleton onBack={() => router.back()} />;
  if (!record)
    return (
      <Screen>
        <Button label={t("back")} onPress={() => router.back()} />
        <PageFeedback {...detail} onRetry={detail.retry} />
        {!detail.loading && !detail.error ? <Txt>{t("empty")}</Txt> : null}
      </Screen>
    );
  function receiptContext(snapshot: Transaction): ReceiptContext | undefined {
    if (!app.membership) return undefined;
    const customer = detail.value?.customer;
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
  const effectiveRecord =
    corrections.filter((a) => !a.kind || a.kind === "correction").at(-1)
      ?.snapshot ?? record;
  const effectivePhone = effectiveRecord.phone;
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
      <FormPicturePreview picture={picture} onClose={() => setPicture(null)} />
      <Notice message={error} tone="error" />
      <Notice message={message} />
      {voided ? <Notice message={t("recordVoided")} tone="error" /> : null}
      <RecordDetailSummary
        record={record}
        syncState={op?.state ?? record.syncState}
        voided={voided}
        corrected={corrections.some((a) => !a.kind || a.kind === "correction")}
      />
      {!voided && effectiveRecord.direction === "buy" ? (
        <View style={{ marginBottom: 16 }}>
          <Button
            icon="arrow-top-right"
            label={t("sellThisPhone")}
            onPress={() =>
              router.push({
                pathname: "/new-record",
                params: { direction: "sell", purchase: record.id },
              })
            }
          />
        </View>
      ) : null}
      <Card>
        <SectionTitle title={t("customerDetails")} icon="account-outline" />
        <Txt bold size={20}>
          {record.customer.name}
        </Txt>
        {record.customer.phone ? (
          <Txt
            selectable
            muted
            style={{ writingDirection: "ltr", marginTop: 4 }}
          >
            {record.customer.phone}
          </Txt>
        ) : null}
        <View style={{ marginTop: 14 }}>
          <Button
            secondary
            small
            icon="account-arrow-right-outline"
            label={t("viewCustomer")}
            onPress={() =>
              router.push({
                pathname: "/customer/[id]",
                params: { id: record.customerId },
              })
            }
          />
        </View>
        <View style={{ marginTop: 14 }}>
          <RecordDetailField
            label={t("idNumber")}
            value={record.customer.idNumber}
            numeric
          />
        </View>
        <Disclosure title={t("moreDetails")} icon="account-details-outline">
          {Object.entries(record.customer)
            .filter(([k, v]) => v && !["name", "phone", "idNumber"].includes(k))
            .map(([k, v]) => (
              <RecordDetailField
                key={k}
                label={t(k as keyof typeof record.customer)}
                value={k === "idType" ? t(v === "pnid" ? "pnid" : "enid") : v}
                numeric={["relativePhone", "idVolume", "idPage"].includes(k)}
              />
            ))}
        </Disclosure>
      </Card>
      <Card style={{ backgroundColor: colors.mint, borderColor: "#D6E5DA" }}>
        <SectionTitle title={t("recordReceipt")} icon="file-document-outline" />
        <Disclosure
          title={t("recordFormLayout")}
          hint={t(originalLayout ? "originalFormLayout" : "pashtoForm")}
        >
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
          {originalLayout ? <Notice message={t("draftForm")} /> : null}
        </Disclosure>
        <Row style={{ flexWrap: "wrap", alignItems: "stretch", marginTop: 8 }}>
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
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
          <View style={{ flexGrow: 1, flexBasis: 120 }}>
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
          </View>
        </Row>
        <View style={{ marginTop: 10 }}>
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
      </Card>
      <Card>
        <SectionTitle title={t("phoneDetails")} icon="cellphone" />
        {(["imei1", "imei2"] as const).map((key) => (
          <RecordDetailField
            key={key}
            label={t(key)}
            value={record.phone[key]}
            numeric
          />
        ))}
        <Row style={{ flexWrap: "wrap", gap: 0 }}>
          {(["color", "storage", "ram", "simCount", "condition"] as const)
            .filter((key) => record.phone[key])
            .map((key) => (
              <View
                key={key}
                style={{
                  flexBasis: "50%",
                  flexGrow: 1,
                  paddingEnd: 12,
                  minWidth: 130,
                }}
              >
                <RecordDetailField label={t(key)} value={record.phone[key]} />
              </View>
            ))}
        </Row>
        <RecordDetailField label={t("notes")} value={record.phone.notes} />
      </Card>
      <Card>
        <Disclosure
          title={t("recordPhotos")}
          icon="image-multiple-outline"
          hint={t("recordPhotosHint")}
        >
          <RecordPhotos
            recordId={record.id}
            direction={record.direction}
            editable={app.membership?.role === "owner" && !voided}
            savedRecord={record}
          />
        </Disclosure>
      </Card>
      <PreviousShop imeis={[effectivePhone.imei1, effectivePhone.imei2]} />
      {corrections.length ? (
        <Card>
          <Disclosure
            title={t("amendments")}
            icon="history"
            hint={`${corrections.length} · ${t("recordHistoryHint")}`}
          >
            {corrections.map((a, index) => (
              <View
                key={a.id}
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: colors.bg,
                  gap: 6,
                }}
              >
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
      {app.membership?.role === "owner" && !voided ? (
        <Card>
          <SectionTitle title={t("recordManage")} icon="file-edit-outline" />
          <View style={{ gap: 12 }}>
            {app.membership?.role === "owner" &&
            !edit &&
            !voided &&
            !voiding ? (
              <Button
                secondary
                label={t("amend")}
                icon="pencil-outline"
                disabled={busy}
                onPress={() => {
                  setReason("");
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
                    variant="destructive"
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
                  disabled={busy}
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
                <Field
                  label={t("reason")}
                  value={reason}
                  onChangeText={setReason}
                />
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
                <Button
                  label={t("cancel")}
                  secondary
                  disabled={busy}
                  onPress={() => setEdit(null)}
                />
              </Card>
            ) : null}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
