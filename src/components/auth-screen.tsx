import { useRef, useState } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { backend } from "../data/backend";
import { company } from "../domain/company";
import { signInPhoneNumber, type SignInPhone } from "../domain/sign-in-phone";
import { SignInPhoneField } from "./sign-in-phone-field";
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
  const { height, width, fontScale } = useWindowDimensions();
  const compact = height < 700 || fontScale > 1.3;
  const [phone, setPhone] = useState<SignInPhone>({
    country: "AF",
    number: "",
  });
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
    <Screen ambient style={styles.page}>
      <View
        style={[
          styles.main,
          { gap: compact ? 20 : 32, paddingVertical: compact ? 12 : 24 },
        ]}
      >
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: 10,
            }}
          >
            <Image
              source={require("../../assets/images/mobilereg-icon.png")}
              accessibilityLabel="Radefy MobileReg"
              resizeMode="contain"
              style={{ width: 48, height: 48, borderRadius: 12 }}
            />
            <Text
              style={{
                color: colors.ink,
                fontSize: 16,
                fontWeight: "700",
                writingDirection: "ltr",
              }}
            >
              Radefy MobileReg
            </Text>
          </View>
          <View style={{ height: compact ? 12 : 20 }} />
          <Txt size={28} bold style={{ marginBottom: 8 }}>
            {t("app")}
          </Txt>
          <Txt size={15} muted style={{ marginBottom: compact ? 16 : 24 }}>
            {t("tagline")}
          </Txt>
          <Row style={{ flexWrap: "wrap" }}>
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
        <View style={styles.formGroup}>
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
            <Card style={{ marginBottom: 0, padding: width < 360 ? 16 : 20 }}>
              <Heading title={t("signIn")} subtitle={t("invitationOnly")} />
              <SignInPhoneField
                value={phone}
                onChange={setPhone}
                disabled={busy}
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
                  void run(() =>
                    app
                      .signIn(signInPhoneNumber(phone), code)
                      .finally(() => setCode("")),
                  )
                }
              />
              <View style={{ height: 18 }} />
              <View
                style={{
                  flexDirection: app.language === "en" ? "row" : "row-reverse",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Txt muted size={12}>
                  {t("recovery")}
                </Txt>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`WhatsApp ${company.phoneLabel}`}
                  onPress={() => void Linking.openURL(company.whatsappUrl)}
                  style={({ pressed }) => ({
                    direction: "ltr",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    minHeight: 44,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Icon name="whatsapp" size={16} color={colors.green} />
                  <Text
                    style={{
                      color: colors.green,
                      fontSize: 12,
                      fontWeight: "700",
                      writingDirection: "ltr",
                      textDecorationLine: "underline",
                    }}
                  >
                    {company.phoneLabel}
                  </Text>
                </Pressable>
              </View>
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
        </View>
      </View>
      <View
        style={{
          paddingTop: 16,
          paddingBottom: 8,
          direction: "ltr",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Image
          source={require("../../assets/Radefy Systems - Logo Variations by Alif Design-04.png")}
          accessibilityLabel={company.name}
          resizeMode="contain"
          style={{ width: 32, height: 32 }}
        />
        <Text
          style={{ color: colors.muted, fontSize: 12, writingDirection: "ltr" }}
        >
          © {new Date().getFullYear()}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={company.websiteLabel}
          onPress={() => void Linking.openURL(company.website)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text
            style={{
              color: colors.green,
              fontSize: 12,
              fontWeight: "700",
              writingDirection: "ltr",
              textDecorationLine: "underline",
            }}
          >
            {company.websiteLabel}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, maxWidth: 520 },
  // Grow only into spare height. Intrinsic content remains scrollable on short
  // screens, in landscape, and at large text sizes; no fixed screen heights.
  main: { flexGrow: 1, flexShrink: 0, justifyContent: "center" },
  formGroup: { gap: 12 },
});
