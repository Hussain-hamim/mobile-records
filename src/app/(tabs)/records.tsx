import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Button,
  SearchField,
  Disclosure,
  Txt,
  Chip,
  Empty,
  Field,
  Heading,
  Row,
  Screen,
} from "../../components/ui";
import { RecordRow } from "../../components/record-row";
import { matchesRecord } from "../../domain/validation";
import { localDay } from "../../domain/format";
export default function Records() {
  const { records, t } = useApp();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [date, setDate] = useState("");
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          matchesRecord(r, query) &&
          (kind === "all" || r.direction === kind) &&
          (!date || localDay(r.occurredAt) === date),
      ),
    [records, query, kind, date],
  );
  return (
    <Screen scroll={false}>
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
      <Row style={{ marginBottom: 15 }}>
        {(["all", "buy", "sell"] as const).map((k) => (
          <Chip
            key={k}
            label={t(k)}
            active={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </Row>
      <Disclosure title={t("filters")} icon="calendar-range">
        <Field
          label={`${t("date")} · YYYY-MM-DD`}
          value={date}
          onChangeText={setDate}
          numeric
          placeholder="2026-10-01"
        />
      </Disclosure>
      <Txt muted size={12} style={{ marginTop: 12, marginBottom: 12 }}>
        {filtered.length} {t("records")}
      </Txt>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <RecordRow record={item} />}
        ListEmptyComponent={<Empty title={t("empty")} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
      />
    </Screen>
  );
}
