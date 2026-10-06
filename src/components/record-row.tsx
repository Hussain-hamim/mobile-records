import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { formatDate, formatMoney, phoneLabel } from "../domain/format";
import type { Transaction } from "../domain/models";
import { useApp } from "../state/app-context";
import { Icon, Row, Txt, colors } from "./ui";

export function RecordRow({ record }: { record: Transaction }) {
  const { language, gregorian, t, rtl, amendments } = useApp();
  const buy = record.direction === "buy";
  const accent = buy ? colors.green : colors.amber;
  const soft = buy ? colors.mint : colors.pale;
  const label = phoneLabel(record.phone.brand, record.phone.model);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${record.customer.name}`}
      onPress={() =>
        router.push({ pathname: "/record/[id]", params: { id: record.id } })
      }
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? soft : colors.paper },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <Row style={{ gap: 12, alignItems: "flex-start" }}>
          <View style={[styles.icon, { backgroundColor: soft }]}>
            <Icon
              name={buy ? "cellphone-arrow-down" : "cellphone-check"}
              size={22}
              color={accent}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt bold size={15} style={{ marginBottom: 3 }}>
              {label}
            </Txt>
            <Txt muted size={12}>
              {record.customer.name}
            </Txt>
            <Row style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <View style={[styles.badge, { backgroundColor: soft }]}>
                <Txt size={10} bold color={accent}>
                  {t(amendments.some(a => a.recordId === record.id && a.kind === "void") ? "recordVoided" : buy ? "bought" : "sold")}
                </Txt>
              </View>
              <Txt size={11} muted>
                {formatDate(record.occurredAt, language, gregorian)}
              </Txt>
            </Row>
          </View>
          <View style={styles.aside}>
            <Txt bold size={13}>
              {formatMoney(record.price, language)}
            </Txt>
            <Icon
              name={rtl ? "chevron-left" : "chevron-right"}
              size={18}
              color={colors.muted}
            />
          </View>
        </Row>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  stripe: {
    width: 4,
  },
  body: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aside: {
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 2,
  },
});
