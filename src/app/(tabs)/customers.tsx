import { router } from "expo-router";
import { useMemo, useState } from "react";
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
import { digits, matchesTazkiraNumber } from "../../domain/validation";
import { useApp } from "../../state/app-context";
import { usePage } from "../../state/use-page";

export default function Customers() {
  const { customers, t } = useApp();
  const [query, setQuery] = useState("");
  const q = digits(query).trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          matchesTazkiraNumber(c.person.idNumber, q) ||
          [c.person.name, c.person.phone, c.person.idNumber].some((s) =>
            digits(s).toLocaleLowerCase().includes(q),
          ),
      ),
    [customers, q],
  );
  const page = usePage(filtered, q);
  return (
    <Screen scroll={false} style={{ paddingBottom: 0 }}>
      <Heading title={t("customers")} subtitle={t("savedCustomers")} />
      <SearchField
        placeholder={t("search")}
        value={query}
        onChangeText={setQuery}
      />
      <FingerprintSearch onManual={() => {}} />
      <Txt size={12} muted style={{ marginBottom: 16 }}>
        {page.items.length === filtered.length
          ? `${filtered.length} ${t("customers")}`
          : `${page.items.length} / ${filtered.length} ${t("customers")}`}
      </Txt>
      <FlatList
        data={page.items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Card>
            <Row style={{ alignItems: "flex-start" }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
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
                <Txt muted size={12} style={{ marginTop: 3 }}>
                  {item.person.phone}
                </Txt>
                <Txt muted size={11} style={{ marginTop: 2 }}>
                  {item.person.idNumber}
                </Txt>
              </View>
            </Row>
            <Row style={{ marginTop: 14, gap: 8 }}>
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
          <Empty title={t("customers")} hint={t("emptyHint")} />
        }
        onEndReached={page.hasMore ? page.loadMore : undefined}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListFooterComponent={
          page.hasMore ? (
            <View style={{ paddingVertical: 14 }}>
              <Button
                small
                secondary
                label={t("loadMore")}
                onPress={page.loadMore}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
