import { useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
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
    <Screen keepBottomVisible>
      <View style={{ paddingTop: 18, paddingBottom: 26 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            gap: 4,
          }}
        >
          <Image
            source={require("../../assets/Radefy Systems - Logo Variations by Alif Design-04.png")}
            accessibilityLabel="Radefy Systems"
            resizeMode="contain"
            style={{ width: 72, height: 72 }}
          />
          <Text
            style={{
              color: colors.ink,
              fontSize: 16,
              fontWeight: "700",
              writingDirection: "ltr",
            }}
          >
            Radefy Systems
          </Text>
        </View>
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
      {phase === "revoked" ? (
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
      {phase === "login" && __DEV__ ? (
        <Button
          label={t("demo")}
          secondary
          icon="eye-outline"
          loading={busy}
          onPress={() => void run(app.enterDemo)}
        />
      ) : null}
      <View
        style={{
          marginTop: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Text
          style={{ color: colors.muted, fontSize: 12, writingDirection: "ltr" }}
        >
          Developed by:{" "}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="RadefySystems.com"
          onPress={() => void Linking.openURL("https://radefysystems.com")}
        >
          <Text
            style={{
              color: colors.ink,
              fontSize: 12,
              fontWeight: "700",
              writingDirection: "ltr",
            }}
          >
            RadefySystems.com
          </Text>
        </Pressable>
        <Text
          style={{ color: colors.muted, fontSize: 12, writingDirection: "ltr" }}
        >
          /
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="WhatsApp +93 77 170 7272"
          onPress={() => void Linking.openURL("https://wa.me/93771707272")}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Icon name="whatsapp" size={16} color="#25D366" />
          <Text
            style={{
              color: colors.ink,
              fontSize: 12,
              fontWeight: "700",
              writingDirection: "ltr",
            }}
          >
            +93 77 170 7272
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
