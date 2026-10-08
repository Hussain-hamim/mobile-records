import { View } from "react-native";
import type { SyncState, Transaction } from "../domain/models";
import { formatMoney, phoneLabel } from "../domain/format";
import { useApp } from "../state/app-context";
import { Card, Icon, Row, Txt, colors } from "./ui";

export function RecordDetailSummary({
  record,
  syncState,
  voided,
  corrected,
}: {
  record: Transaction;
  syncState: SyncState;
  voided: boolean;
  corrected: boolean;
}) {
  const { t, language, demo } = useApp();
  return (
    <Card
      style={{
        backgroundColor: colors.navy,
        borderColor: colors.navy,
        padding: 20,
      }}
    >
      <Row
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <Row
          style={{
            gap: 8,
            backgroundColor: "#FFFFFF18",
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Icon
            name={
              record.direction === "buy"
                ? "arrow-bottom-left"
                : "arrow-top-right"
            }
            size={18}
            color={colors.lime}
          />
          <Txt bold size={13} color={colors.lime}>
            {t(record.direction === "buy" ? "bought" : "sold")}
          </Txt>
        </Row>
        <Row style={{ gap: 6 }}>
          <Icon
            name={
              voided
                ? "cancel"
                : syncState === "synced" || demo
                  ? "check-circle-outline"
                  : "cloud-upload-outline"
            }
            size={16}
            color={colors.lime}
          />
          <Txt size={12} color={colors.lime}>
            {t(voided ? "recordVoided" : demo ? "demoMode" : syncState)}
          </Txt>
        </Row>
      </Row>
      <Txt size={23} bold color="#fff">
        {phoneLabel(record.phone.brand, record.phone.model)}
      </Txt>
      <View style={{ marginTop: 18, gap: 3 }}>
        <Txt size={12} color={colors.lime}>
          {t("price")}
        </Txt>
        <Txt size={30} bold color="#fff" style={{ writingDirection: "ltr" }}>
          {formatMoney(record.price, language)}
        </Txt>
      </View>
      {corrected ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "#FFFFFF26",
            marginTop: 18,
            paddingTop: 12,
            gap: 3,
          }}
        >
          <Txt size={12} bold color={colors.lime}>
            {t("originalRecord")}
          </Txt>
          <Txt size={12} color={colors.lime}>
            {t("recordOriginalHint")}
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}

export function RecordDetailField({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  if (!value) return null;
  return (
    <View
      style={{
        paddingVertical: 11,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        gap: 4,
      }}
    >
      <Txt muted size={12}>
        {label}
      </Txt>
      <Txt
        selectable
        size={15}
        style={numeric ? { writingDirection: "ltr" } : undefined}
      >
        {value}
      </Txt>
    </View>
  );
}
