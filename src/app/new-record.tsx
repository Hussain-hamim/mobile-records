import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { FingerprintCards } from "../components/fingerprint-cards";
import { FingerprintPrompt } from "../components/fingerprint-prompt";
import { PersonFields } from "../components/person-fields";
import { RecordPhotos } from "../components/record-photos";
import { recordSectionStyles } from "../components/record-section-styles";
import { Scanner } from "../components/scanner";
import { ShopProfileNotice } from "../components/shop-profile-notice";
import { isShopProfileComplete } from "../domain/shop-profile";
import {
  Button,
  Card,
  Chip,
  Disclosure,
  Field,
  Heading,
  Icon,
  IconButton,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Txt,
  colors,
  errorText,
} from "../components/ui";
import { fillDemoStep } from "../domain/demo-data";
import { draftFingerprints, scanTemplates } from "../domain/fingerprints";
import {
  emptyPerson,
  emptyPhone,
  type Draft,
  type Phone,
} from "../domain/models";
import {
  applyPhoneSuggestions,
  resolvePhoneSuggestions,
} from "../domain/phone-lookup";
import { normalizeImei, validateDraft } from "../domain/validation";
import { lookupTac } from "../services/tac";
import { useApp } from "../state/app-context";
export default function NewRecord() {
  const app = useApp();
  const { t } = app;
  const params = useLocalSearchParams<{
    direction?: string;
    draft?: string;
    customer?: string;
    scan?: string;
  }>();
  const preset = app.customers.find((c) => c.id === params.customer);
  const [draft, setDraft] = useState<Draft>(
    () =>
      (() => {
        const saved = app.drafts.find((d) => d.id === params.draft);
        return saved ? { ...saved, step: Math.min(saved.step, 1) } : null;
      })() ?? {
        id: Crypto.randomUUID(),
        direction: params.direction === "sell" ? "sell" : "buy",
        phone: emptyPhone(),
        customer: preset?.person ?? emptyPerson(),
        customerId: params.customer ?? "",
        customerConfirmed: true,
        fingerprints: [],
        price: "",
        createdAt: new Date().toISOString(),
        step: 0,
      },
  );
  const [scanner, setScanner] = useState<"id" | "imei" | null>(
    params.scan === "imei" ? "imei" : null,
  );
  const [imeiTarget, setImeiTarget] = useState<"imei1" | "imei2">("imei1");
  const [showSecondImei, setShowSecondImei] = useState(false);
  const secondImeiVisible = showSecondImei || Boolean(draft.phone.imei2);
  const [choosing, setChoosing] = useState(false);
  const [fingerFind, setFingerFind] = useState(false);
  const currentCustomer = app.customers.find((c) => c.id === draft.customerId);
  const fingers = draftFingerprints(draft, currentCustomer);
  function chooseCustomer(id: string) {
    const c = app.customers.find((c) => c.id === id);
    if (!c) return;
    patch({
      customer: { ...c.person },
      customerId: c.id,
      fingerprints: [],
      fingerprintTemplate: undefined,
      fingerprintSkip: undefined,
      customerConfirmed: true,
    });
    setChoosing(false);
  }
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lookupRequest = useRef(0);
  useEffect(
    () => () => {
      lookupRequest.current++;
    },
    [],
  );
  const latest = useRef(draft);
  const completed = useRef(false);
  const write = useRef(app.saveDraft);
  const saveChain = useRef(Promise.resolve());
  useEffect(() => {
    latest.current = draft;
    write.current = app.saveDraft;
  }, [draft, app.saveDraft]);
  const persist = useCallback((d: Draft) => {
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() => write.current(d));
    return saveChain.current;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!completed.current)
        void persist(latest.current).catch((e) => setError(errorText(e, t)));
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, t, persist]);
  useEffect(
    () => () => {
      if (!completed.current) void persist(latest.current).catch(() => {});
    },
    [persist],
  );
  function patch(values: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...values }));
  }
  function phone(key: keyof Phone, value: string) {
    if (key === "imei1" || key === "imei2") {
      lookupRequest.current++;
      setBusy(false);
      setHint("");
    }
    setDraft((d) => ({ ...d, phone: { ...d.phone, [key]: value } }));
  }
  function fillDemo() {
    if (!app.demo) return;
    setDraft(fillDemoStep);
    setError("");
    setHint("");
    setChoosing(false);
  }
  const history = app.records.filter(
    (r) =>
      [r.phone.imei1, r.phone.imei2].includes(
        normalizeImei(draft.phone.imei1),
      ) && draft.phone.imei1.length > 0,
  );
  async function lookup(
    value = draft.phone.imei1,
    target: "imei1" | "imei2" = "imei1",
  ) {
    const request = ++lookupRequest.current;
    const baseline = draft.phone;
    setBusy(true);
    setHint("");
    setError("");
    try {
      const imei = normalizeImei(value);
      const found = await resolvePhoneSuggestions(imei, app.records, lookupTac);
      if (request !== lookupRequest.current) return;
      if (found)
        setDraft((d) => ({
          ...d,
          phone: applyPhoneSuggestions(d.phone, baseline, found, target, imei),
        }));
      setHint(t(found ? "suggested" : "lookupMissing"));
    } catch (e) {
      if (request === lookupRequest.current) setError(errorText(e, t));
    } finally {
      if (request === lookupRequest.current) setBusy(false);
    }
  }
  function advance() {
    const errors = validateDraft(draft);
    const issue =
      draft.step === 0
        ? errors.find((e) =>
            ["invalidImei", "invalidSecondImei", "invalidPrice"].includes(e),
          ) || (!draft.phone.model.trim() ? "modelRequired" : "")
        : !draft.customer.name.trim() || !draft.customer.idNumber.trim()
          ? "customerRequired"
          : "";
    if (issue) {
      setError(errorText(new Error(issue), t));
      return;
    }
    setError("");
    setHint("");
    patch({ step: draft.step + 1 });
  }
  async function finish() {
    if (photoBusy) return;
    if (!isShopProfileComplete(app.membership?.profile)) {
      setError(t("shopRequired"));
      return;
    }
    setBusy(true);
    setError("");
    const ready = { ...latest.current, customerConfirmed: true };
    latest.current = ready;
    setDraft(ready);
    try {
      const errors = validateDraft(ready);
      if (errors.length) throw new Error(errors[0]);
      completed.current = true;
      await persist(ready);
      const r = await app.finalize(ready);
      router.replace({ pathname: "/record/[id]", params: { id: r.id } });
    } catch (e) {
      completed.current = false;
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen resetKey={`${draft.step}:${error}`}>
      <Heading
        title={t("newRecord")}
        subtitle={t(draft.direction)}
        action={
          <Button
            small
            secondary
            label={t("back")}
            onPress={() => router.back()}
          />
        }
      />
      <ShopProfileNotice />
      {discarding ? (
        <Card>
          <Notice message={t("discardDraftHint")} />
          <Button
            variant="destructive"
            label={t("discardDraft")}
            disabled={busy || photoBusy}
            onPress={() => {
              completed.current = true;
              setBusy(true);
              void saveChain.current
                .catch(() => {})
                .then(() => app.discardDraft(draft.id))
                .then(() => router.back())
                .catch((e) => {
                  completed.current = false;
                  setError(errorText(e, t));
                })
                .finally(() => setBusy(false));
            }}
          />
          <Button
            secondary
            label={t("cancel")}
            disabled={busy}
            onPress={() => setDiscarding(false)}
          />
        </Card>
      ) : (
        <Button
          small
          secondary
          label={t("discardDraft")}
          disabled={busy || photoBusy}
          onPress={() => setDiscarding(true)}
        />
      )}
      <Row style={{ marginBottom: 12 }}>
        {(["phoneDetails", "customerDetails"] as const).map((k, i) => (
          <View
            key={k}
            style={{
              flex: 1,
              borderTopWidth: 4,
              borderRadius: 3,
              borderColor: draft.step >= i ? colors.green : colors.line,
              paddingTop: 8,
            }}
          >
            <Txt
              size={12}
              bold
              color={draft.step >= i ? colors.green : colors.muted}
            >
              {i + 1}. {t(k)}
            </Txt>
          </View>
        ))}
      </Row>
      <Notice message={error} tone="error" />
      <Notice message={hint} />
      {app.demo ? (
        <View style={{ marginBottom: 12, gap: 8 }}>
          <Button
            small
            secondary
            icon="auto-fix"
            label={t("fillDemoData")}
            disabled={busy}
            onPress={fillDemo}
          />
          <Txt size={11} muted style={{ textAlign: "center" }}>
            {t("demoFillHint")}
          </Txt>
        </View>
      ) : null}
      {draft.step === 0 ? (
        <>
          <Row style={{ marginBottom: 12 }}>
            <Chip
              label={t("buy")}
              active={draft.direction === "buy"}
              onPress={() => patch({ direction: "buy" })}
            />
            <Chip
              label={t("sell")}
              active={draft.direction === "sell"}
              onPress={() => patch({ direction: "sell" })}
            />
          </Row>
          <Card style={recordSectionStyles.imei}>
            <SectionTitle
              title={t("scanImei")}
              hint={t("scanIntro")}
              icon="barcode-scan"
            />
            <Row style={{ marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Button
                  icon="barcode-scan"
                  label={t("scanImei")}
                  onPress={() => {
                    setImeiTarget("imei1");
                    setScanner("imei");
                  }}
                />
              </View>
              {secondImeiVisible && (
                <Button
                  small
                  secondary
                  label="IMEI 2"
                  onPress={() => {
                    setImeiTarget("imei2");
                    setScanner("imei");
                  }}
                />
              )}
            </Row>
            <Field
              label={t("imei1") + " *"}
              value={draft.phone.imei1}
              onChangeText={(v) => phone("imei1", v)}
              numeric
              keyboardType="numeric"
              maxLength={15}
              complete={normalizeImei(draft.phone.imei1).length === 15}
            />
            {secondImeiVisible ? (
              <Field
                label={t("imei2")}
                value={draft.phone.imei2}
                onChangeText={(v) => phone("imei2", v)}
                numeric
                keyboardType="numeric"
                maxLength={15}
                complete={normalizeImei(draft.phone.imei2).length === 15}
              />
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Button
                  small
                  secondary
                  icon="plus"
                  label={t("addSecondImei")}
                  onPress={() => setShowSecondImei(true)}
                />
              </View>
            )}
            <Button
              small
              secondary
              label={t("lookup")}
              loading={busy}
              onPress={() => void lookup()}
            />
            {history.length ? (
              <View style={{ marginTop: 12 }}>
                <Txt muted size={12}>
                  {t("history")}: {history.length}
                </Txt>
              </View>
            ) : null}
          </Card>
          <Card style={recordSectionStyles.phone}>
            <SectionTitle title={t("essentials")} icon="cellphone" />
            <Row style={{ alignItems: "flex-start" }}>
              {(["brand", "model"] as const).map((k) => (
                <View key={k} style={{ flex: 1, minWidth: 0 }}>
                  <Field
                    label={t(k) + (k === "model" ? " *" : "")}
                    value={draft.phone[k]}
                    onChangeText={(v) => phone(k, v)}
                  />
                </View>
              ))}
            </Row>
            <Field
              label={t("price") + " *"}
              value={draft.price}
              onChangeText={(price) => patch({ price })}
              keyboardType="decimal-pad"
              numeric
            />
            <Disclosure
              title={t("moreDetails")}
              hint={t("phoneExtra")}
              icon="tune-variant"
            >
              {(
                [
                  "color",
                  "simCount",
                  "storage",
                  "ram",
                  "condition",
                  "notes",
                ] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={t(k)}
                  value={draft.phone[k]}
                  onChangeText={(v) => phone(k, v)}
                  multiline={k === "notes"}
                />
              ))}
            </Disclosure>
          </Card>
        </>
      ) : null}
      {draft.step === 1 ? (
        <>
          <Row style={{ marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                small
                secondary
                label={t("findCustomerCompact")}
                onPress={() => setChoosing((open) => !open)}
              />
            </View>
            <IconButton
              icon="fingerprint"
              label={t("fpReturning")}
              onPress={() => setFingerFind(true)}
            />
          </Row>
          <Card>
            <Disclosure title={t("attachmentTools")} icon="camera-outline">
              <RecordPhotos
                tileStyle={recordSectionStyles.photos}
                recordId={draft.id}
                direction={draft.direction}
                editable
                onBusyChange={setPhotoBusy}
              />
            </Disclosure>
          </Card>
          {choosing ? (
            <Card>
              {app.customers.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    chooseCustomer(c.id);
                    setChoosing(false);
                  }}
                  style={{
                    padding: 12,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Txt>{c.person.name}</Txt>
                  <Txt muted size={11}>
                    {c.person.idNumber}
                  </Txt>
                </Pressable>
              ))}
            </Card>
          ) : null}
          {fingerFind ? (
            <FingerprintPrompt
              mode="identify"
              templates={scanTemplates(app.customers)}
              onClose={() => setFingerFind(false)}
              onIdentified={(id) => {
                setFingerFind(false);
                chooseCustomer(id);
              }}
            />
          ) : null}
          <View style={{ height: 8 }} />
          <Card style={recordSectionStyles.customer}>
            <Row style={{ marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt bold size={16}>
                  {t("customerDetails")}
                </Txt>
              </View>
              <Button
                small
                secondary
                icon="card-account-details-outline"
                label={t("scanIdCompact")}
                onPress={() => setScanner("id")}
              />
            </Row>
            <PersonFields
              value={draft.customer}
              onChange={(customer) => patch({ customer })}
            />
          </Card>
          <View style={{ marginTop: 12 }}>
            <Txt muted size={12} style={{ marginBottom: 8 }}>
              {t("fingerprintOptional")}
            </Txt>
            <FingerprintCards
              cardStyle={recordSectionStyles.fingerprint}
              entries={fingers}
              customerId={draft.customerId || draft.id}
              manageStored={false}
              temporaryIds={(draft.fingerprints ?? []).map((f) => f.id)}
              onChange={async (entries) => {
                const next: Draft = {
                  ...latest.current,
                  fingerprints: entries.filter(
                    (f) =>
                      !currentCustomer?.fingerprints?.some(
                        (saved) => saved.id === f.id,
                      ) && f.id !== `legacy-${currentCustomer?.id}`,
                  ),
                  fingerprintTemplate: undefined,
                  fingerprintSkip: undefined,
                };
                // Enrollment is not accepted until its encrypted draft is on disk.
                latest.current = next;
                setDraft(next);
                await persist(next);
              }}
              onDuplicate={chooseCustomer}
            />
          </View>
        </>
      ) : null}
      <Row style={{ marginTop: 12 }}>
        {draft.step > 0 ? (
          <Button
            label={t("back")}
            secondary
            onPress={() => {
              setError("");
              setHint("");
              patch({ step: draft.step - 1 });
            }}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={t(draft.step === 0 ? "next" : "saveRecord")}
            disabled={draft.step > 0 && !isShopProfileComplete(app.membership?.profile)}
            loading={busy}
            icon={
              draft.step === 0
                ? app.rtl
                  ? "arrow-left"
                  : "arrow-right"
                : "check"
            }
            onPress={() => (draft.step === 0 ? advance() : void finish())}
          />
        </View>
      </Row>
      <Row style={{ justifyContent: "center", marginTop: 12 }}>
        <Icon name="cloud-check-outline" size={16} color={colors.muted} />
        <Txt size={11} muted>
          {t(app.demo ? "demoDraftHint" : "autoSaved")}
        </Txt>
      </Row>
      {scanner ? (
        <Scanner
          mode={scanner}
          onClose={() => setScanner(null)}
          onImei={(value) => {
            phone(imeiTarget, value);
            void lookup(value, imeiTarget);
          }}
          onPerson={(person) =>
            patch({
              customer: { ...draft.customer, ...person, idType: "enid" },
              customerConfirmed: true,
            })
          }
        />
      ) : null}
    </Screen>
  );
}
