import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useApp } from "../state/app-context";
import { backend } from "../data/backend";
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View style={{ paddingTop: 28, paddingBottom: 36 }}>
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
          <Chip label="ANDROID · V1" />
        </Row>
        <View style={{ height: 35 }} />
        <Heading title={t("app")} subtitle={t("tagline")} />
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
      ) : phase === "locked" ? (
        <Card>
          <Heading title={t("unlock")} subtitle={t("unlockHint")} />
          <Button
            label={t("unlock")}
            icon="lock-open-outline"
            onPress={() => void run(app.unlock)}
            loading={busy}
          />
        </Card>
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
          <Heading
            title={t(phase === "password" ? "changePassword" : "signIn")}
            subtitle={t("invitationOnly")}
          />
          {phase !== "password" ? (
            <Field
              label={t("phone")}
              value={phone}
              onChangeText={setPhone}
              placeholder="+93 700 123 456"
              keyboardType="phone-pad"
              numeric
            />
          ) : null}
          <Field
            label={t(phase === "password" ? "newPassword" : "password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={
              phase === "password" ? "new-password" : "current-password"
            }
          />
          <Notice message={error} tone="error" />
          {!backend || Platform.OS === "web" ? (
            <Notice message={t("setup")} />
          ) : null}
          <Button
            label={t(phase === "password" ? "changePassword" : "signIn")}
            icon="arrow-right"
            loading={busy}
            disabled={!backend || Platform.OS !== "android"}
            onPress={() =>
              void run(() =>
                phase === "password"
                  ? app.changePassword(password)
                  : app.signIn(phone, password),
              )
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
      {phase === "locked" ? (
        <>
          <Notice message={error} tone="error" />
          <Button
            label={t("openSettings")}
            secondary
            onPress={() => void Linking.openSettings()}
          />
        </>
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
