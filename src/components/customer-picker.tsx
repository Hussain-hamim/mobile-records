import { useState } from "react";
import { Pressable } from "react-native";
import { useApp } from "../state/app-context";
import { useServerPage } from "../state/use-server-page";
import { Card, SearchField, Txt, colors } from "./ui";
import { PageFeedback } from "./page-feedback";
export function CustomerPicker({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const { queries, membership, dataVersion, t } = useApp();
  const [query, setQuery] = useState("");
  const page = useServerPage(
    (cursor: string | null, signal) =>
      queries!.customers(query, cursor, signal),
    `${membership?.shopId}:${dataVersion}:${query}`,
    !!queries,
  );
  return (
    <Card>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t("search")}
      />
      {page.items.map((customer) => (
        <Pressable
          key={customer.id}
          accessibilityRole="button"
          onPress={() => onSelect(customer.id)}
          style={{
            padding: 12,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Txt>{customer.person.name}</Txt>
          <Txt muted size={11}>
            {customer.person.idNumber}
          </Txt>
        </Pressable>
      ))}
      {!page.loading && !page.error && !page.items.length ? (
        <Txt muted>{t("empty")}</Txt>
      ) : null}
      <PageFeedback {...page} onMore={page.loadMore} onRetry={page.retry} />
    </Card>
  );
}
