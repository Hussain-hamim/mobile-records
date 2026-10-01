import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../state/app-context";
import type { Transaction } from "../domain/models";
import { formatDate, formatMoney } from "../domain/format";
import { Icon, Row, Txt, colors } from "./ui";
export function RecordRow({ record }: { record: Transaction }) {
  const { language, gregorian, t } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.phone.model}, ${record.customer.name}`}
      onPress={() =>
        router.push({ pathname: "/record/[id]", params: { id: record.id } })
      }
      style={({ pressed }) => ({
        paddingVertical: 17,
        opacity: pressed ? 0.7 : 1,
        borderBottomWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Row>
        <View
          style={{
            width: 46,
            height: 54,
            borderRadius: 14,
            backgroundColor:
              record.direction === "buy" ? colors.mint : colors.pale,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            name={
              record.direction === "buy"
                ? "cellphone-arrow-down"
                : "cellphone-check"
            }
            color={record.direction === "buy" ? colors.green : colors.amber}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Txt bold size={14}>
            {record.phone.brand} {record.phone.model}
          </Txt>
          <Txt muted size={11}>
            {record.customer.name} ·{" "}
            {t(record.direction === "buy" ? "bought" : "sold")}
          </Txt>
        </View>
        <View>
          <Txt bold size={12}>
            {formatMoney(record.price, language)}
          </Txt>
          <Txt muted size={10}>
            {formatDate(record.occurredAt, language, gregorian)}
          </Txt>
        </View>
      </Row>
    </Pressable>
  );
}
