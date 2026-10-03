import { router, useLocalSearchParams } from "expo-router";
import { useApp } from "../../state/app-context";
import { fingerprintsOf } from "../../domain/fingerprints";
import {
  Button,
  Card,
  Disclosure,
  Empty,
  Heading,
  Icon,
  Row,
  Screen,
  Txt,
  colors,
} from "../../components/ui";
import { FingerprintCards } from "../../components/fingerprint-cards";
import { RecordRow } from "../../components/record-row";
import { View } from "react-native";
import { formatDate } from "../../domain/format";
export default function CustomerProfile() {
  const app = useApp(),
    { t } = app;
  const { id } = useLocalSearchParams<{ id: string }>();
  const customer = app.customers.find((c) => c.id === id);
  const records = app.records.filter((r) => r.customerId === id);
  if (!customer)
    return (
      <Screen>
        <Button label={t("back")} onPress={() => router.back()} />
        <Empty title={t("customers")} hint={t("empty")} />
      </Screen>
    );
  return (
    <Screen>
      <Heading
        title={t("fpProfile")}
        action={
          <Button
            small
            secondary
            label={t("back")}
            onPress={() => router.back()}
          />
        }
      />
      <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
        <Icon name="account-circle-outline" size={48} color={colors.lime} />
        <Txt bold size={27} color="#fff" style={{ marginTop: 12 }}>
          {customer.person.name}
        </Txt>
        <Txt color="#D7DCEB">{customer.person.phone}</Txt>
        <Txt color="#D7DCEB">{customer.person.idNumber}</Txt>
        <Txt color={colors.lime} style={{ marginTop: 14 }}>
          {fingerprintsOf(customer).length} / 2 ·{" "}
          {t(fingerprintsOf(customer).length ? "fpEnrolled" : "fpNotEnrolled")}
        </Txt>
      </Card>
      <Row style={{ marginBottom: 20 }}>
        {(["buy", "sell"] as const).map((direction) => (
          <View key={direction} style={{ flex: 1 }}>
            <Button
              label={t(direction)}
              onPress={() =>
                router.push({
                  pathname: "/new-record",
                  params: { customer: id, direction },
                })
              }
            />
          </View>
        ))}
      </Row>
      <Card>
        <Disclosure title={t("customerDetails")} icon="account-outline">
          {Object.entries(customer.person)
            .filter(([, v]) => !!v)
            .map(([key, value]) => (
              <View key={key} style={{ marginBottom: 12 }}>
                <Txt muted size={12}>
                  {t(key as keyof typeof customer.person)}
                </Txt>
                <Txt>{value}</Txt>
              </View>
            ))}
        </Disclosure>
      </Card>
      <FingerprintCards
        entries={fingerprintsOf(customer)}
        customerId={id}
        onChange={(entries, reason) =>
          app.saveFingerprints(id, entries, reason, customer.version)
        }
      />
      {customer.fingerprintAudit?.length ? (
        <Card>
          <Disclosure title={t("fpAudit")} icon="history">
            {customer.fingerprintAudit.map((event, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Txt>
                  {t(event.slot === "primary" ? "fpPrimary" : "fpBackup")} ·{" "}
                  {t(
                    event.action === "add"
                      ? "fpAdd"
                      : event.action === "remove"
                        ? "fpRemove"
                        : "fpReplace",
                  )}
                </Txt>
                <Txt muted size={12}>
                  {formatDate(event.at, app.language, app.gregorian)}
                </Txt>
                {event.reason ? <Txt size={12}>{event.reason}</Txt> : null}
              </View>
            ))}
          </Disclosure>
        </Card>
      ) : null}
      <Heading
        title={t("customerHistory")}
        subtitle={`${records.length} ${t("records")}`}
      />
      {records.length ? (
        records.map((r) => <RecordRow key={r.id} record={r} />)
      ) : (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      )}
    </Screen>
  );
}
