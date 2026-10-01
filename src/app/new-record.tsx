import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { useApp } from "../state/app-context";
import {
  emptyPerson,
  emptyPhone,
  type Draft,
  type Phone,
} from "../domain/models";
import { normalizeImei, validImei, validateDraft } from "../domain/validation";
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Icon,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
  errorText,
} from "../components/ui";
import { PersonFields } from "../components/person-fields";
import { Scanner } from "../components/scanner";
import { lookupTac } from "../services/tac";
export default function NewRecord() {
  const app = useApp();
  const { t } = app;
  const params = useLocalSearchParams<{
    direction?: string;
    draft?: string;
    customer?: string;
  }>();
  const [draft, setDraft] = useState<Draft>(
    () =>
      app.drafts.find((d) => d.id === params.draft) ?? {
        id: Crypto.randomUUID(),
        direction: params.direction === "sell" ? "sell" : "buy",
        phone: emptyPhone(),
        customer:
          app.customers.find((c) => c.id === params.customer)?.person ??
          emptyPerson(),
        customerId: params.customer ?? "",
        customerConfirmed: false,
        price: "",
        createdAt: new Date().toISOString(),
        step: 0,
      },
  );
  const [scanner, setScanner] = useState<"id" | "imei" | null>(null);
  const [imeiTarget, setImeiTarget] = useState<"imei1" | "imei2">("imei1");
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
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
        void persist(draft).catch((e) => setError(errorText(e, t)));
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
    setDraft((d) => ({ ...d, phone: { ...d.phone, [key]: value } }));
  }
  const history = app.records.filter(
    (r) =>
      [r.phone.imei1, r.phone.imei2].includes(
        normalizeImei(draft.phone.imei1),
      ) && draft.phone.imei1.length > 0,
  );
  async function lookup() {
    setBusy(true);
    setHint("");
    try {
      const imei = normalizeImei(draft.phone.imei1);
      if (!validImei(imei)) throw new Error("invalidImei");
      const previous = history[0];
      if (previous) {
        setDraft((d) => ({
          ...d,
          phone: {
            ...previous.phone,
            imei1: imei,
            imei2: d.phone.imei2,
            condition: "",
            notes: "",
          },
        }));
        setHint(t("suggested"));
      } else {
        const found = await lookupTac(imei);
        if (found) {
          setDraft((d) => ({ ...d, phone: { ...d.phone, ...found } }));
          setHint(t("suggested"));
        } else setHint(t("lookupMissing"));
      }
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      const errors = validateDraft(draft);
      if (errors.length) throw new Error(errors[0]);
      completed.current = true;
      await saveChain.current;
      const r = await app.finalize(draft);
      router.replace({ pathname: "/record/[id]", params: { id: r.id } });
    } catch (e) {
      completed.current = false;
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
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
      <Row style={{ marginBottom: 20 }}>
        {(["phoneDetails", "customerDetails", "review"] as const).map(
          (k, i) => (
            <View
              key={k}
              style={{
                flex: 1,
                borderTopWidth: 3,
                borderColor: draft.step >= i ? colors.green : colors.line,
                paddingTop: 8,
              }}
            >
              <Txt
                size={11}
                color={draft.step >= i ? colors.green : colors.muted}
              >
                {i + 1}. {t(k)}
              </Txt>
            </View>
          ),
        )}
      </Row>
      <Notice message={error} tone="error" />
      <Notice message={hint} />
      {draft.step === 0 ? (
        <>
          <Row style={{ marginBottom: 20 }}>
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
          <Card>
            <Row style={{ marginBottom: 20 }}>
              <View style={{ flex: 1 }}>
                <Button
                  secondary
                  icon="barcode-scan"
                  label={t("scanImei")}
                  onPress={() => {
                    setImeiTarget("imei1");
                    setScanner("imei");
                  }}
                />
              </View>
              <Button
                small
                secondary
                label="IMEI 2"
                onPress={() => {
                  setImeiTarget("imei2");
                  setScanner("imei");
                }}
              />
            </Row>
            <Field
              label={t("imei1") + " *"}
              value={draft.phone.imei1}
              onChangeText={(v) => phone("imei1", v)}
              numeric
              keyboardType="numeric"
            />
            <Field
              label={t("imei2")}
              value={draft.phone.imei2}
              onChangeText={(v) => phone("imei2", v)}
              numeric
              keyboardType="numeric"
            />
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
          <Card>
            {(
              [
                "brand",
                "model",
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
                label={t(k) + (k === "model" ? " *" : "")}
                value={draft.phone[k]}
                onChangeText={(v) => phone(k, v)}
                multiline={k === "notes"}
              />
            ))}
            <Field
              label={t("price") + " *"}
              value={draft.price}
              onChangeText={(price) => patch({ price })}
              keyboardType="decimal-pad"
              numeric
            />
          </Card>
        </>
      ) : null}
      {draft.step === 1 ? (
        <>
          <Row style={{ marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                icon="card-account-details-outline"
                label={t("scanId")}
                onPress={() => setScanner("id")}
              />
            </View>
          </Row>
          <Button
            small
            secondary
            label={t("chooseCustomer")}
            onPress={() => setChoosing(!choosing)}
          />
          {choosing ? (
            <Card>
              {app.customers.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    patch({
                      customer: { ...c.person },
                      customerId: c.id,
                      customerConfirmed: false,
                    });
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
          <View style={{ height: 16 }} />
          <Card>
            <PersonFields
              value={draft.customer}
              onChange={(customer) =>
                patch({ customer, customerConfirmed: false })
              }
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.customerConfirmed }}
              onPress={() =>
                patch({ customerConfirmed: !draft.customerConfirmed })
              }
            >
              <Row>
                <Icon
                  name={
                    draft.customerConfirmed
                      ? "checkbox-marked"
                      : "checkbox-blank-outline"
                  }
                  color={colors.green}
                />
                <View style={{ flex: 1 }}>
                  <Txt size={13}>{t("confirmCustomer")}</Txt>
                </View>
              </Row>
            </Pressable>
          </Card>
        </>
      ) : null}
      {draft.step === 2 ? (
        <>
          <Notice message={t("draftForm")} />
          <Card>
            <Txt muted size={12}>
              {t("phoneDetails")}
            </Txt>
            <Txt bold size={23}>
              {draft.phone.brand} {draft.phone.model}
            </Txt>
            <Txt>{draft.phone.imei1}</Txt>
            {draft.phone.imei2 ? <Txt>{draft.phone.imei2}</Txt> : null}
            <Txt muted>
              {draft.phone.color} · {draft.phone.storage} · {draft.phone.ram}
            </Txt>
            <Txt bold size={22}>
              {draft.price} AFN
            </Txt>
          </Card>
          <Card>
            <Txt muted size={12}>
              {t("customerDetails")}
            </Txt>
            {Object.entries(draft.customer)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <View key={k} style={{ marginBottom: 9 }}>
                  <Txt size={11} muted>
                    {t(k as keyof typeof draft.customer)}
                  </Txt>
                  <Txt>{v}</Txt>
                </View>
              ))}
          </Card>
          <Card>
            <Txt muted size={12}>
              {t("shopDetails")}
            </Txt>
            <Txt bold>{app.membership?.profile.shopName}</Txt>
            <Txt>{app.membership?.profile.name}</Txt>
            <Txt muted>{app.membership?.profile.address}</Txt>
          </Card>
        </>
      ) : null}
      <Row style={{ marginTop: 12 }}>
        {draft.step > 0 ? (
          <Button
            label={t("back")}
            secondary
            onPress={() => patch({ step: draft.step - 1 })}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            label={t(draft.step === 2 ? "saveRecord" : "next")}
            loading={busy}
            icon={draft.step === 2 ? "check" : "arrow-right"}
            onPress={() =>
              draft.step === 2 ? void finish() : patch({ step: draft.step + 1 })
            }
          />
        </View>
      </Row>
      {scanner ? (
        <Scanner
          mode={scanner}
          onClose={() => setScanner(null)}
          onImei={(value) => phone(imeiTarget, value)}
          onPerson={(person) =>
            patch({
              customer: { ...draft.customer, ...person },
              customerConfirmed: false,
            })
          }
        />
      ) : null}
    </Screen>
  );
}
