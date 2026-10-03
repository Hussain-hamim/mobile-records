import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FingerprintPrompt } from "../../components/fingerprint-prompt";
import { RecordRow } from "../../components/record-row";
import {
  Button,
  Card,
  Empty,
  Icon,
  IconButton,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
} from "../../components/ui";
import { formatDate, localDay } from "../../domain/format";
import { scanTemplates } from "../../domain/fingerprints";
import { useApp } from "../../state/app-context";
export default function Home() {
  const app = useApp();
  const { t, rtl } = app;
  const [finger, setFinger] = useState(false);
  const [fpError, setFpError] = useState("");
  const today = app.records.filter(
    (r) => localDay(r.occurredAt) === localDay(new Date().toISOString()),
  );
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", marginBottom: 28 }}>
        <Row style={{ flex: 1 }}>
          <View style={styles.brand}>
            <Icon name="cellphone-check" color="#fff" size={25} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={16} bold>
              {t("app")}
            </Txt>
            <Txt size={11} muted>
              {formatDate(
                new Date().toISOString(),
                app.language,
                app.gregorian,
              )}
            </Txt>
          </View>
        </Row>
        <IconButton
          label={t("settings")}
          icon="storefront-outline"
          onPress={() => router.push("/settings")}
        />
      </Row>
      <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <Txt size={12} muted>
          {t("welcomeBack")}
        </Txt>
        {app.demo ? (
          <View style={styles.demo}>
            <View style={styles.dot} />
            <Txt size={10} color={colors.green} bold>
              {t("demoMode")}
            </Txt>
          </View>
        ) : null}
      </Row>
      <Txt size={32} bold style={{ marginBottom: 6 }}>
        {app.membership?.profile.shopName || t("home")}
      </Txt>
      <Txt size={14} muted style={{ marginBottom: 24 }}>
        {t("nextDeal")}
      </Txt>
      <Row style={{ gap: 12, alignItems: "stretch", marginBottom: 16 }}>
        {(["buy", "sell"] as const).map((direction) => {
          const buy = direction === "buy";
          return (
            <Pressable
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
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Row
                style={{ justifyContent: "space-between", marginBottom: 28 }}
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
                    size={27}
                  />
                </View>
                <Icon
                  name="plus"
                  size={18}
                  color={buy ? "#C6C8FF" : "#AD7656"}
                />
              </Row>
              <Txt size={20} bold color={buy ? "#fff" : colors.ink}>
                {t(direction)}
              </Txt>
              <Txt
                size={11}
                color={buy ? "#E0E1FF" : "#774D3A"}
                style={{ marginTop: 5 }}
              >
                {t(buy ? "buyHint" : "sellHint")}
              </Txt>
            </Pressable>
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
              padding: 10,
              borderRadius: 14,
            }}
          >
            <Icon name="fingerprint" color={colors.ink} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt bold size={14}>
              {t("scanFingerprint")}
            </Txt>
            <Txt muted size={11}>
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
      <Card
        style={{
          backgroundColor: colors.navy,
          borderColor: colors.navy,
          padding: 20,
          marginBottom: 26,
        }}
      >
        <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <Txt color="#D8DBF1" size={12}>
            {t("overview")}
          </Txt>
          <Icon name="chart-timeline-variant" color={colors.lime} size={22} />
        </Row>
        <Row style={{ justifyContent: "space-between", gap: 6 }}>
          {[
            [String(today.length).padStart(2, "0"), t("records")],
            [today.filter((r) => r.direction === "buy").length, t("bought")],
            [today.filter((r) => r.direction === "sell").length, t("sold")],
          ].map(([count, label], index) => (
            <View
              key={label}
              style={{
                flex: 1,
                alignItems:
                  index === 0 ? (rtl ? "flex-end" : "flex-start") : "center",
                borderStartWidth: index ? 1 : 0,
                borderColor: "#41455F",
              }}
            >
              <Txt
                size={index === 0 ? 30 : 26}
                color={index === 0 ? colors.lime : "#fff"}
                bold
              >
                {count}
              </Txt>
              <Txt size={11} color="#B7BCD5">
                {label}
              </Txt>
            </View>
          ))}
        </Row>
      </Card>
      {app.drafts.length ? (
        <View style={{ marginBottom: 20 }}>
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
        app.records.slice(0, 3).map((r) => <RecordRow record={r} key={r.id} />)
      ) : (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      )}
      <Row style={{ marginTop: 18, paddingHorizontal: 4 }}>
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
            <Txt size={11} muted>
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
  brand: {
    backgroundColor: colors.green,
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  demo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.mint,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  action: { flex: 1, borderRadius: 26, padding: 20 },
  actionIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  scan: {
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 16,
  },
});
