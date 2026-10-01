import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../state/app-context";
import type { Transaction } from "../domain/models";
import { formatDate, formatMoney } from "../domain/format";
import { Icon, Row, Txt, colors } from "./ui";
export function RecordRow({ record }: { record: Transaction }) {
  const { language, gregorian, t, rtl } = useApp();
  const buy = record.direction === "buy";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.phone.model}, ${record.customer.name}`}
      onPress={() =>
        router.push({ pathname: "/record/[id]", params: { id: record.id } })
      }
      style={({ pressed }) => ({
        padding: 15,
        marginBottom: 10,
        borderRadius: 20,
        backgroundColor: pressed ? colors.mint : colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Row style={{ gap: 12 }}>
        <View
          style={{
            width: 45,
            height: 52,
            borderRadius: 15,
            backgroundColor: buy ? colors.mint : colors.pale,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            name={buy ? "cellphone-arrow-down" : "cellphone-check"}
            size={25}
            color={buy ? colors.green : colors.amber}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt bold size={14}>
            {record.phone.brand} {record.phone.model}
          </Txt>
          <Txt muted size={12} style={{ marginTop: 3 }}>
            {record.customer.name}
          </Txt>
        </View>
        <Icon
          name={rtl ? "chevron-left" : "chevron-right"}
          size={18}
          color="#A1A5B8"
        />
      </Row>
      <Row
        style={{
          justifyContent: "space-between",
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 1,
          borderColor: colors.line,
          gap: 5,
        }}
      >
        <View
          style={{
            backgroundColor: buy ? colors.mint : colors.pale,
            borderRadius: 7,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Txt size={10} bold color={buy ? colors.green : colors.amber}>
            {t(buy ? "bought" : "sold")}
          </Txt>
        </View>
        <Txt size={10} muted>
          {formatDate(record.occurredAt, language, gregorian)}
        </Txt>
        <Txt bold size={13}>
          {formatMoney(record.price, language)}
        </Txt>
      </Row>
    </Pressable>
  );
}
