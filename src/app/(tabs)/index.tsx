import { GradientFill, MotionPressable } from "../../components/visual-effects";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { FingerprintPrompt } from "../../components/fingerprint-prompt";
import { HomeInsights } from "../../components/home-insights";
import { ShopProfileNotice } from "../../components/shop-profile-notice";
import { RecordRow } from "../../components/record-row";
import {
  Button,
  Empty,
  Icon,
  IconButton,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
} from "../../components/ui";
import { scanTemplates } from "../../domain/fingerprints";
import { formatDate } from "../../domain/format";
import { useApp } from "../../state/app-context";
export default function Home() {
  const app = useApp();
  const { t, rtl } = app;
  const [finger, setFinger] = useState(false);
  const [fpError, setFpError] = useState("");
  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <Image
          source={require("../../../assets/images/mobilereg-logo-transparent.png")}
          accessibilityLabel="Radefy MobileReg"
          resizeMode="contain"
          style={{ width: 40, height: 40 }}
        />
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <Txt size={16} bold>
            {t("app")}
          </Txt>
          <Txt size={11} muted style={{ marginTop: 4 }}>
            {formatDate(new Date().toISOString(), app.language, app.gregorian)}
          </Txt>
        </View>
        <IconButton
          label={t("settings")}
          icon="storefront-outline"
          onPress={() => router.push("/settings")}
        />
      </View>
      {app.demo ? (
        <Row style={{ justifyContent: "flex-end", marginBottom: 8 }}>
          <View style={styles.demo}>
            <View style={styles.dot} />
            <Txt size={10} color={colors.green} bold>
              {t("demoMode")}
            </Txt>
          </View>
        </Row>
      ) : null}
      <Txt size={24} bold style={{ marginBottom: 24 }}>
        {app.membership?.profile.shopName || t("home")}
      </Txt>
      <ShopProfileNotice />
      <Row style={{ gap: 12, alignItems: "stretch", marginBottom: 16 }}>
        {(["buy", "sell"] as const).map((direction) => {
          const buy = direction === "buy";
          return (
            <MotionPressable
              key={direction}
              accessibilityRole="button"
              accessibilityLabel={t(direction)}
              onPress={() =>
                router.push({ pathname: "/new-record", params: { direction } })
              }
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: buy ? colors.green : colors.peach,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              {buy ? <GradientFill /> : null}
              <Row
                style={{ justifyContent: "space-between", marginBottom: 16 }}
              >
                <View
                  style={[
                    styles.actionIcon,
                    { backgroundColor: buy ? "#FFFFFF26" : "#FFFFFF77" },
                  ]}
                >
                  <Icon
                    name={buy ? "arrow-bottom-left" : "arrow-top-right"}
                    color={buy ? "#fff" : colors.ink}
                    size={22}
                  />
                </View>
                <Icon
                  name="plus"
                  size={18}
                  color={buy ? colors.lime : colors.green}
                />
              </Row>
              <Txt size={17} bold color={buy ? "#fff" : colors.ink}>
                {t(direction)}
              </Txt>
              <Txt
                size={11}
                color={buy ? colors.lime : colors.green}
                style={{ marginTop: 8 }}
              >
                {t(buy ? "buyHint" : "sellHint")}
              </Txt>
            </MotionPressable>
          );
        })}
      </Row>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("scanFingerprint")}
        onPress={() => {
          setFpError("");
          setFinger(true);
        }}
        style={({ pressed }) => [styles.scan, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Row>
          <View
            style={{
              backgroundColor: colors.mint,
              padding: 8,
              borderRadius: 10,
            }}
          >
            <Icon name="fingerprint" color={colors.ink} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold size={14}>
              {t("scanFingerprint")}
            </Txt>
            <Txt muted size={12} style={{ marginTop: 4 }}>
              {t("scanFingerprintIntro")}
            </Txt>
          </View>
          <Icon
            name={rtl ? "chevron-left" : "chevron-right"}
            color={colors.muted}
          />
        </Row>
      </Pressable>
      <Notice message={fpError} tone="error" />
      <HomeInsights />
      {app.drafts.length ? (
        <View style={{ marginBottom: 28 }}>
          <Button
            label={t("resume")}
            secondary
            icon="file-edit-outline"
            onPress={() =>
              router.push({
                pathname: "/new-record",
                params: { draft: app.drafts[0].id },
              })
            }
          />
        </View>
      ) : null}
      <Row style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <Txt bold size={19}>
          {t("recent")}
        </Txt>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/records")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Row style={{ gap: 4 }}>
            <Txt size={12} color={colors.green} bold>
              {t("allRecords")}
            </Txt>
            <Icon
              name={rtl ? "arrow-left" : "arrow-right"}
              size={16}
              color={colors.green}
            />
          </Row>
        </Pressable>
      </Row>
      {app.records.length ? (
        app.records.slice(0, 3).map((r) => (
          <View key={r.id} style={{ marginBottom: 6 }}>
            <RecordRow record={r} />
          </View>
        ))
      ) : (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      )}
      <Row style={{ marginTop: 24, paddingHorizontal: 4 }}>
        <Icon
          name={
            app.demo
              ? "flask-outline"
              : app.operations.length
                ? "cloud-upload-outline"
                : "cloud-check-outline"
          }
          size={20}
          color={app.demo ? colors.muted : colors.success}
        />
        <View style={{ flex: 1 }}>
          <Txt size={11} muted>
            {app.demo
              ? t("demoBanner")
              : t(app.operations.length ? "pending" : "synced") +
                (app.operations.length ? ` · ${app.operations.length}` : "")}
          </Txt>
          {!app.demo ? (
            <Txt size={11} muted style={{ marginTop: 4 }}>
              {t("syncHint")}
            </Txt>
          ) : null}
        </View>
        {!app.demo ? (
          <Button
            small
            label={t("sync")}
            secondary
            loading={app.syncing}
            onPress={() => void app.sync()}
          />
        ) : null}
      </Row>
      {finger ? (
        <FingerprintPrompt
          mode="identify"
          templates={scanTemplates(app.customers)}
          onIdentified={(customerId) => {
            setFinger(false);
            router.push({
              pathname: "/customer/[id]",
              params: { id: customerId },
            });
          }}
          onClose={() => setFinger(false)}
        />
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.mint,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  action: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    overflow: "hidden",
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scan: {
    borderRadius: 12,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 28,
  },
});
