import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { homeMetrics, type MetricPeriod } from "../domain/home-metrics";
import { formatDate, formatMoney } from "../domain/format";
import { useApp } from "../state/app-context";
import { Card, Disclosure, Row, Txt, colors } from "./ui";

export function HomeInsights() {
  const { records, amendments, gregorian, language, t } = useApp();
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
  }, [records, amendments]);
  const metrics = useMemo(
    () => homeMetrics(records, amendments, new Date(clock), gregorian),
    [records, amendments, gregorian, clock],
  );
  const m = metrics[period];
  return (
    <Card>
      <Row style={{ justifyContent: "space-between", gap: 8 }}>
        {(["buy", "sell"] as const).map((direction) => (
          <View key={direction} style={{ flex: 1 }}>
            <Txt size={12} muted>
              {t(direction === "buy" ? "bought" : "sold")} · {t(period)}
            </Txt>
            <Txt size={20} bold color={colors.green}>
              {direction === "buy" ? m.purchases : m.sales}
            </Txt>
          </View>
        ))}
        <View style={{ flex: 1 }}>
          <Txt size={12} muted>
            {t("records")}
          </Txt>
          <Txt size={20} bold>
            {m.count}
          </Txt>
        </View>
      </Row>
      <Disclosure title={t("shopInsights")} icon="chart-bar">
        <Row style={{ gap: 4, marginBottom: 12 }}>
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
            <View key={direction} style={{ flex: 1 }}>
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
        <Txt muted size={11} style={{ marginTop: 8 }}>
          {formatDate(m.start, language, gregorian)} · {t("metricsToNow")}
        </Txt>
        <Txt muted size={11}>
          {t(gregorian ? "metricsGregorian" : "metricsSolar")}
        </Txt>
        <Txt muted size={11}>
          {t("metricsSubtitle")}
        </Txt>
      </Disclosure>
    </Card>
  );
}
