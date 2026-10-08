import { useEffect, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { type MetricPeriod } from "../domain/home-metrics";
import { formatDate, formatMoney, localDay } from "../domain/format";
import { useApp } from "../state/app-context";
import { PageFeedback } from "./page-feedback";
import { useShopQuery } from "../state/use-shop-query";
import { useIsFocused } from "expo-router";
import { Card, Disclosure, Row, Txt, colors } from "./ui";

export function HomeInsights() {
  const { queries, membership, dataVersion, gregorian, language, t } = useApp();
  const focused = useIsFocused();
  const [period, setPeriod] = useState<MetricPeriod>("today");
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const immediate = setTimeout(() => setClock(Date.now()), 0);
    const timer = setInterval(() => setClock(Date.now()), 30000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setClock(Date.now());
    });
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  const metrics = useShopQuery(() => queries!.metrics(new Date(clock),gregorian), `${membership?.shopId}:${dataVersion}:${gregorian}:${localDay(new Date(clock).toISOString())}`, !!queries && focused);
  if (!metrics.value) return <Card><PageFeedback loading={metrics.loading} error={metrics.error} onRetry={metrics.retry}/></Card>;
  const m = metrics.value[period];
  return (
    <Card style={{ padding: 18, marginBottom: 28 }}>
      <Row
        style={{
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        {(["buy", "sell"] as const).map((direction) => (
          <View key={direction} style={{ flex: 1, gap: 8 }}>
            <Txt size={12} muted>
              {t(direction === "buy" ? "bought" : "sold")} · {t(period)}
            </Txt>
            <Txt size={20} bold color={colors.green}>
              {direction === "buy" ? m.purchases : m.sales}
            </Txt>
          </View>
        ))}
        <View style={{ flex: 1, gap: 8 }}>
          <Txt size={12} muted>
            {t("records")}
          </Txt>
          <Txt size={20} bold>
            {m.count}
          </Txt>
        </View>
      </Row>
      <View
        style={{
          marginTop: 18,
          paddingTop: 8,
          borderTopWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Disclosure title={t("shopInsights")} icon="chart-bar">
          <Row style={{ gap: 8, marginBottom: 20 }}>
            {(["today", "thisWeek", "thisMonth"] as const).map((p) => (
              <Pressable
                key={p}
                accessibilityRole="tab"
                accessibilityState={{ selected: period === p }}
                onPress={() => setPeriod(p)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 8,
                  justifyContent: "center",
                  backgroundColor: period === p ? colors.mint : colors.bg,
                }}
              >
                <Txt
                  size={12}
                  bold={period === p}
                  color={colors.green}
                  style={{ textAlign: "center" }}
                >
                  {t(p)}
                </Txt>
              </Pressable>
            ))}
          </Row>
          <Row style={{ alignItems: "flex-start" }}>
            {(["buy", "sell"] as const).map((direction) => (
              <View key={direction} style={{ flex: 1, gap: 6 }}>
                <Txt size={12} muted>
                  {t(direction === "buy" ? "bought" : "sold")}
                </Txt>
                <Txt size={16} bold>
                  {formatMoney(
                    direction === "buy" ? m.purchaseTotal : m.saleTotal,
                    language,
                  )}
                </Txt>
              </View>
            ))}
          </Row>
          <Txt muted size={11} style={{ marginTop: 16 }}>
            {formatDate(m.start, language, gregorian)} · {t("metricsToNow")}
          </Txt>
          <Txt muted size={11} style={{ marginTop: 6 }}>
            {t(gregorian ? "metricsGregorian" : "metricsSolar")}
          </Txt>
          <Txt muted size={11} style={{ marginTop: 6 }}>
            {t("metricsSubtitle")}
          </Txt>
        </Disclosure>
      </View>
    </Card>
  );
}
