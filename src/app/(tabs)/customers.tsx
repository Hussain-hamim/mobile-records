import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { FingerprintSearch } from "../../components/fingerprint-search";
import {
  Button,
  Card,
  Empty,
  Heading,
  IconButton,
  Row,
  Screen,
  SearchField,
  Txt,
  colors,
} from "../../components/ui";

import { useApp } from "../../state/app-context";
import { useServerPage } from "../../state/use-server-page";
import { PageFeedback } from "../../components/page-feedback";

export default function Customers() {
  const { queries, dataVersion, membership, t } = useApp();
  const focused = useIsFocused();
  const [query, setQuery] = useState("");
  const page = useServerPage((cursor: string | null, signal) => queries!.customers(query,cursor,signal), `${membership?.shopId}:${dataVersion}:${query}`, !!queries && focused);
  return (
    <Screen scroll={false} style={{ paddingBottom: 0 }}>
      <FlatList
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        ListHeaderComponent={
          <>
            <Heading title={t("customers")} subtitle={t("savedCustomers")} />
            <SearchField
              placeholder={t("search")}
              value={query}
              onChangeText={setQuery}
            />
            <FingerprintSearch onManual={() => {}} />
            <Txt size={12} muted style={{ marginBottom: 8 }}>
              {`${page.items.length}${page.hasMore ? "+" : ""} ${t("customers")}`}
            </Txt>
          </>
        }
        data={page.items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Card>
            <Row style={{ alignItems: "flex-start" }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: colors.mint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt bold color={colors.green} size={20}>
                  {item.person.name.slice(0, 1)}
                </Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt bold size={16}>
                  {item.person.name}
                </Txt>
                <Txt muted size={12} style={{ marginTop: 3, writingDirection: "ltr" }}>
                  {item.person.phone}
                </Txt>
                <Txt muted size={11} style={{ marginTop: 2, writingDirection: "ltr" }}>
                  {item.person.idNumber}
                </Txt>
              </View>
            </Row>
            <Row style={{ marginTop: 8, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  small
                  secondary
                  icon="account-outline"
                  label={t("viewCustomer")}
                  onPress={() =>
                    router.push({
                      pathname: "/customer/[id]",
                      params: { id: item.id },
                    })
                  }
                />
              </View>
              <IconButton
                icon="plus"
                label={t("newRecord")}
                onPress={() =>
                  router.push({
                    pathname: "/new-record",
                    params: { customer: item.id },
                  })
                }
              />
            </Row>
          </Card>
        )}
        ListEmptyComponent={
          !page.loading && !page.error ? <Empty title={t("customers")} hint={t("emptyHint")} /> : null
        }
        onEndReached={page.hasMore ? page.loadMore : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        refreshing={page.loading && !page.items.length}
        onRefresh={page.reload}
        ListFooterComponent={<PageFeedback {...page} onMore={page.loadMore} onRetry={page.retry} />}
      />
    </Screen>
  );
}
