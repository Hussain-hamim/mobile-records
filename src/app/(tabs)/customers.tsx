import { FingerprintSearch } from "../../components/fingerprint-search";
import { useState } from "react";
import { digits } from "../../domain/validation";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  IconButton,
  Button,
  Card,
  Empty,
  SearchField,
  Heading,
  Row,
  Screen,
  Txt,
  colors,
} from "../../components/ui";
export default function Customers() {
  const { customers, t } = useApp();
  const [query, setQuery] = useState("");
  const q = digits(query).trim().toLocaleLowerCase();
  return (
    <Screen scroll={false}>
      <Heading title={t("customers")} subtitle={t("savedCustomers")} />
      <SearchField
        placeholder={t("search")}
        value={query}
        onChangeText={setQuery}
      />
      <FingerprintSearch onManual={() => {}} />
      <Txt size={12} muted style={{ marginBottom: 16 }}>
        {customers.length} {t("customers")}
      </Txt>
      <FlatList
        data={customers.filter((c) =>
          [c.person.name, c.person.phone, c.person.idNumber].some((s) =>
            digits(s).toLocaleLowerCase().includes(q),
          ),
        )}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <Card>
            <Row>
              <View
                style={{
                  backgroundColor: colors.mint,
                  padding: 12,
                  borderRadius: 18,
                }}
              >
                <Txt bold color={colors.green} size={20}>
                  {item.person.name.slice(0, 1)}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold>{item.person.name}</Txt>
                <Txt muted size={12}>
                  {item.person.phone}
                </Txt>
                <Txt muted size={11}>
                  {item.person.idNumber}
                </Txt>
              </View>
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
      />
    </Screen>
  );
}
