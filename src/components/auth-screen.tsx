import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { backend } from "../data/backend";
import { useApp } from "../state/app-context";
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
} from "./ui";
export function AuthScreen() {
  const app = useApp();
  const { t, phase } = app;
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function run(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={{ paddingTop: 18, paddingBottom: 26 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View
            style={{
              backgroundColor: colors.green,
              padding: 14,
              borderRadius: 18,
            }}
          >
            <Icon name="cellphone-check" size={28} color="#fff" />
          </View>
          <Icon name="shield-check-outline" size={28} color={colors.green} />
        </Row>
        <View style={{ height: 35 }} />
        <Txt size={38} bold style={{ marginBottom: 12 }}>
          {t("app")}
        </Txt>
        <Txt size={17} muted style={{ marginBottom: 24 }}>
          {t("tagline")}
        </Txt>
        <Row>
          {(["ps", "fa", "en"] as const).map((l) => (
            <Chip
              key={l}
              label={l === "ps" ? "پښتو" : l === "fa" ? "دری" : "English"}
              active={app.language === l}
              onPress={() => void app.preferences(l, app.gregorian)}
            />
          ))}
        </Row>
      </View>
      {phase === "loading" ? (
        <Txt>{t("loading")}</Txt>
      ) : phase === "revoked" ? (
        <>
          <Notice message={t("noAccess")} tone="error" />
          <Button
            label={t("sync")}
            loading={app.syncing}
            onPress={() => void app.sync()}
          />
        </>
      ) : (
        <Card>
          <Heading title={t("signIn")} subtitle={t("invitationOnly")} />
          <Field
            label={t("phone")}
            value={phone}
            onChangeText={setPhone}
            placeholder="+93 700 123 456"
            keyboardType="phone-pad"
            numeric
          />
          <Field
            label={t("loginCode")}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            numeric
            autoComplete="one-time-code"
            maxLength={11}
            placeholder="1234 5678"
          />
          <Txt muted size={12}>
            {t("loginCodeHint")}
          </Txt>
          <Notice message={error} tone="error" />
          {!backend ? (
            <Notice message={t("setup")} />
          ) : Platform.OS === "web" ? (
            <Notice message={t("androidSignIn")} />
          ) : null}
          <Button
            label={t("signIn")}
            icon="arrow-right"
            loading={busy}
            disabled={!backend || Platform.OS !== "android"}
            onPress={() =>
              void run(() => app.signIn(phone, code).finally(() => setCode("")))
            }
          />
          <View style={{ height: 18 }} />
          <Txt muted size={12}>
            {t("recovery")}
          </Txt>
        </Card>
      )}
      {phase === "login" ? (
        <Button
          label={t("demo")}
          secondary
          icon="eye-outline"
          loading={busy}
          onPress={() => void run(app.enterDemo)}
        />
      ) : null}
      <View style={{ marginTop: 30 }}>
        <Row>
          <Icon name="shield-lock-outline" size={18} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <Txt muted size={12}>
              {t("photoPrivacy")}
            </Txt>
          </View>
        </Row>
      </View>
    </Screen>
  );
}
