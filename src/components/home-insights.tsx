import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { homeMetrics, type MetricPeriod } from "../domain/home-metrics";
import { formatDate, formatMoney } from "../domain/format";
import { useApp } from "../state/app-context";
import { Card, Icon, Row, Txt, colors } from "./ui";

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
    <Card
      style={{
        backgroundColor: colors.navy,
        borderColor: colors.navy,
        marginBottom: 26,
      }}
    >
      <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Txt color="#fff" size={18} bold>
            {t("shopInsights")}
          </Txt>
          <Txt color="#B7BCD5" size={11}>
            {t("metricsSubtitle")}
          </Txt>
        </View>
        <Icon name="chart-bar" color={colors.lime} size={26} />
      </Row>
      <Row
        style={{
          gap: 4,
          backgroundColor: "#41455F",
          borderRadius: 14,
          padding: 4,
          marginBottom: 16,
        }}
      >
        {(["today", "thisWeek", "thisMonth"] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p }}
            accessibilityLabel={t(p)}
            onPress={() => setPeriod(p)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              backgroundColor: period === p ? colors.lime : "transparent",
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Txt
              bold
              size={12}
              color={period === p ? colors.navy : "#D8DBF1"}
              style={{ textAlign: "center" }}
            >
              {t(p)}
            </Txt>
          </Pressable>
        ))}
      </Row>
      <Row style={{ gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
        <Txt color="#fff" size={36} bold>
          {m.count}
        </Txt>
        <Txt color="#B7BCD5" size={13} style={{ paddingBottom: 7 }}>
          {t("records")}
        </Txt>
      </Row>
      <Row style={{ alignItems: "stretch", gap: 10 }}>
        {(["buy", "sell"] as const).map((direction) => (
          <View
            key={direction}
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: "#34394F",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <Row style={{ gap: 5, marginBottom: 8 }}>
              <Icon
                name={
                  direction === "buy" ? "arrow-bottom-left" : "arrow-top-right"
                }
                size={16}
                color={direction === "buy" ? "#D8DBF1" : colors.lime}
              />
              <Txt color="#D8DBF1" size={12}>
                {t(direction === "buy" ? "bought" : "sold")}
              </Txt>
            </Row>
            <Txt color="#fff" size={20} bold>
              {direction === "buy" ? m.purchases : m.sales}
            </Txt>
            <Txt
              color={direction === "buy" ? "#D8DBF1" : colors.lime}
              size={14}
              bold
              style={{ marginTop: 6 }}
            >
              {formatMoney(
                direction === "buy" ? m.purchaseTotal : m.saleTotal,
                language,
              )}
            </Txt>
          </View>
        ))}
      </Row>
      <Txt color="#B7BCD5" size={10} style={{ marginTop: 14 }}>
        {formatDate(m.start, language, gregorian)} · {t("metricsToNow")}
      </Txt>
      <Txt color="#B7BCD5" size={10}>
        {t(gregorian ? "metricsGregorian" : "metricsSolar")}
      </Txt>
      {!m.count ? (
        <Txt color="#D8DBF1" size={12} style={{ marginTop: 10 }}>
          {t("metricsEmpty")}
        </Txt>
      ) : null}
    </Card>
  );
}
