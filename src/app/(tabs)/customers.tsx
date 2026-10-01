import { useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Button,
  Card,
  Empty,
  Field,
  Heading,
  Icon,
  Row,
  Screen,
  Txt,
  colors,
} from "../../components/ui";
export default function Customers() {
  const { customers, t } = useApp();
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  return (
    <Screen scroll={false}>
      <Heading
        title={t("customers")}
        subtitle={`${customers.length} ${t("customers")}`}
      />
      <Field label={t("search")} value={query} onChangeText={setQuery} />
      <FlatList
        data={customers.filter((c) =>
          [c.person.name, c.person.phone, c.person.idNumber].some((s) =>
            s.toLocaleLowerCase().includes(q),
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
                <Icon name="account-outline" />
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
                label="+"
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
