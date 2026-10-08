import {
  ModalBackdrop,
  useVisualPreferences,
} from "../../components/visual-effects";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FingerprintSearch } from "../../components/fingerprint-search";
import { RecordRow } from "../../components/record-row";
import {
  Button,
  Chip,
  Empty,
  Heading,
  Icon,
  Row,
  Screen,
  SearchField,
  Txt,
  colors,
} from "../../components/ui";
import { formatDate, localDay } from "../../domain/format";

import { useApp } from "../../state/app-context";
import { useServerPage } from "../../state/use-server-page";
import type { RecordCursor } from "../../data/shop-queries";
import { PageFeedback } from "../../components/page-feedback";

function dayKey(value: Date) {
  return localDay(value.toISOString());
}

function dateFromDay(day: string) {
  if (!day) return new Date();
  const [year, month, dayNumber] = day.split("-").map(Number);
  return new Date(year, month - 1, dayNumber, 12);
}

export default function Records() {
  const { queries, dataVersion, membership, t, language, gregorian } = useApp();
  const focused = useIsFocused();
  const { reduceMotion } = useVisualPreferences();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [date, setDate] = useState("");
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(() => new Date());
  const page = useServerPage((cursor: RecordCursor | null, signal) => queries!.records({query,direction:kind,day:date},cursor,signal), `${membership?.shopId}:${dataVersion}:${JSON.stringify([query,kind,date])}`, !!queries && focused);

  function openPicker() {
    setDraft(dateFromDay(date));
    setPicking(true);
  }

  function applyDate(value: Date) {
    setDate(dayKey(value));
    setPicking(false);
  }

  const locale =
    language === "en" ? "en-GB" : language === "ps" ? "ps-AF" : "fa-AF";

  return (
    <Screen scroll={false} style={{ paddingBottom: 0 }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <Heading
              title={t("records")}
              subtitle={t("recordsHint")}
              action={
                <Button
                  small
                  label={t("newRecord")}
                  icon="plus"
                  onPress={() => router.push("/new-record")}
                />
              }
            />
            <SearchField
              placeholder={t("search")}
              value={query}
              onChangeText={setQuery}
            />
            <FingerprintSearch />
            <Row style={{ marginBottom: 8, gap: 8 }}>
              <Row style={{ flex: 1, flexWrap: "wrap", gap: 8 }}>
                {(["all", "buy", "sell"] as const).map((k) => (
                  <Chip
                    key={k}
                    label={t(k)}
                    active={kind === k}
                    onPress={() => setKind(k)}
                  />
                ))}
              </Row>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("filters")}
                accessibilityState={{ selected: !!date, expanded: picking }}
                onPress={openPicker}
                style={({ pressed }) => [
                  styles.dateButton,
                  {
                    backgroundColor: date
                      ? colors.green
                      : pressed
                        ? colors.mint
                        : colors.paper,
                    borderColor: date ? colors.green : colors.line,
                  },
                ]}
              >
                <Icon
                  name="calendar"
                  color={date ? "#fff" : colors.green}
                  size={22}
                />
              </Pressable>
            </Row>
            {date ? (
              <Row style={{ gap: 8 }}>
                <Txt size={12} color={colors.green}>
                  {formatDate(`${date}T12:00:00+04:30`, language, gregorian)}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("clearDate")}
                  onPress={() => setDate("")}
                  style={styles.clearDateButton}
                >
                  <Icon name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              </Row>
            ) : null}
            <Txt muted size={12} style={{ marginTop: 12, marginBottom: 12 }}>
              {`${page.items.length}${page.hasMore ? "+" : ""} ${t("records")}`}
            </Txt>
          </>
        }
        data={page.items}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <RecordRow record={item} />}
        ListEmptyComponent={!page.loading && !page.error ? <Empty title={t("empty")} /> : null}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        onEndReached={page.hasMore ? page.loadMore : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        refreshing={page.loading && !page.items.length}
        onRefresh={page.reload}
        ListFooterComponent={<PageFeedback {...page} onMore={page.loadMore} onRetry={page.retry} />}
      />
      {picking && Platform.OS === "android" ? (
        <DateTimePicker
          value={draft}
          mode="date"
          presentation="dialog"
          accentColor={colors.green}
          maximumDate={new Date()}
          onValueChange={(_, value) => applyDate(value)}
          onDismiss={() => setPicking(false)}
        />
      ) : null}
      {picking && Platform.OS !== "android" ? (
        <Modal
          transparent
          animationType={reduceMotion ? "none" : "fade"}
          visible={picking}
          onRequestClose={() => setPicking(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
            <ModalBackdrop />
            <Pressable
              style={styles.sheet}
              onPress={(e) => e.stopPropagation()}
            >
              <Txt bold size={18} style={{ marginBottom: 8 }}>
                {t("filters")}
              </Txt>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                accentColor={colors.green}
                themeVariant="light"
                locale={locale}
                timeZoneName="Asia/Kabul"
                maximumDate={new Date()}
                onValueChange={(_, value) => setDraft(value)}
                style={{ alignSelf: "center" }}
              />
              <Row style={{ marginTop: 12, gap: 8 }}>
                {date ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label={t("clearDate")}
                      onPress={() => {
                        setDate("");
                        setPicking(false);
                      }}
                    />
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label={t("today")}
                      onPress={() => setDraft(new Date())}
                    />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Button label={t("done")} onPress={() => applyDate(draft)} />
                </View>
              </Row>
              <View style={{ marginTop: 8 }}>
                <Button
                  secondary
                  label={t("cancel")}
                  onPress={() => setPicking(false)}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateButton: {
    borderWidth: 1,
    borderRadius: 12,
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  clearDateButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
