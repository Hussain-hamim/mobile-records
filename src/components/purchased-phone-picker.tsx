import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { useApp } from "../state/app-context";
import { useServerPage } from "../state/use-server-page";
import type { RecordCursor } from "../data/shop-queries";
import type { PurchasedPhone } from "../domain/purchased-phones";
import { formatDate } from "../domain/format";
import {
  Button,
  Card,
  Chip,
  Heading,
  Notice,
  Row,
  Screen,
  SearchField,
  Txt,
  colors,
} from "./ui";
import { PageFeedback } from "./page-feedback";
import type { useSalePurchase } from "../state/use-sale-purchase";

export function PurchasedPhonePicker({
  onSelect,
  onClose,
  busy,
  error,
}: {
  onSelect: (id: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  const { queries, membership, dataVersion, t, language, gregorian } = useApp();
  const [query, setQuery] = useState("");
  const [includeSold, setIncludeSold] = useState(false);
  const page = useServerPage<PurchasedPhone, RecordCursor>(
    (cursor, signal) =>
      queries!.purchasedPhones({ query, includeSold }, cursor, signal),
    `${membership?.shopId}:${dataVersion}:${query}:${includeSold}`,
    !!queries,
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen scroll={false}>
        <Heading
          title={t("choosePurchasedPhone")}
          action={
            <Button small secondary label={t("close")} onPress={onClose} />
          }
        />
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t("purchaseSearch")}
        />
        <Row style={{ marginBottom: 12 }}>
          <Chip
            label={t("includeSold")}
            active={includeSold}
            onPress={() => setIncludeSold((v) => !v)}
          />
        </Row>
        <Txt muted size={12} style={{ marginBottom: 12 }}>
          {t("purchaseAvailabilityHint")}
        </Txt>
        <Notice message={error} tone="error" />
        <FlatList
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          data={page.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.purchase ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onSelect(item.purchase!.id)}
                style={{ opacity: busy ? 0.5 : 1 }}
              >
                <Card>
                  <Txt bold>
                    {[item.purchase.phone.brand, item.purchase.phone.model]
                      .filter(Boolean)
                      .join(" ")}
                  </Txt>
                  <Txt muted size={13} style={{ marginTop: 6 }}>
                    {[item.purchase.phone.color, item.purchase.phone.storage]
                      .filter(Boolean)
                      .join(" · ")}
                  </Txt>
                  <Txt
                    size={12}
                    style={{ writingDirection: "ltr", marginTop: 6 }}
                  >
                    IMEI ···{item.purchase.phone.imei1.slice(-6)}
                  </Txt>
                  <Txt muted size={12} style={{ marginTop: 6 }}>
                    {formatDate(item.purchase.occurredAt, language, gregorian)}{" "}
                    · {item.purchase.reference}
                  </Txt>
                  {item.latest.direction === "sell" ? (
                    <Txt size={12} color={colors.red} style={{ marginTop: 6 }}>
                      {t("previouslySold")}
                    </Txt>
                  ) : null}
                </Card>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            !page.loading && !page.error ? (
              <Txt muted>{t("noPurchasedPhones")}</Txt>
            ) : null
          }
          ListFooterComponent={
            <PageFeedback
              {...page}
              onMore={page.loadMore}
              onRetry={page.retry}
            />
          }
        />
      </Screen>
    </Modal>
  );
}
export function SalePurchaseConfirmation({
  sale,
}: {
  sale: ReturnType<typeof useSalePurchase>;
}) {
  const { t } = useApp();
  const c = sale.confirmation;
  if (!c) return null;
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={() => c.answer(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#0008",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Card>
          <Txt bold size={19}>
            {t(c.kind === "sold" ? "previouslySold" : "replacePhoneTitle")}
          </Txt>
          <Txt style={{ marginVertical: 14 }}>
            {t(c.kind === "sold" ? "repeatSaleWarning" : "replacePhoneHint")}
          </Txt>
          {c.reference ? (
            <Txt muted style={{ marginBottom: 14 }}>
              {c.reference}
            </Txt>
          ) : null}
          <View style={{ gap: 10 }}>
            <Button
              label={t(
                c.kind === "sold" ? "confirmRepeatSale" : "useSavedPhone",
              )}
              onPress={() => c.answer(true)}
            />
            <Button
              secondary
              label={t("cancel")}
              onPress={() => c.answer(false)}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
