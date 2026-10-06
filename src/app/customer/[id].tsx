import { useState } from "react";
import { CustomerEditor } from "../../components/customer-editor";
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
import { formatAuditDate } from "../../domain/format";
export default function CustomerProfile() {
  const [showHistory, setShowHistory] = useState(false);
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
        <Icon name="account-circle-outline" size={32} color={colors.lime} />
        <Txt bold size={22} color="#fff" style={{ marginTop: 12 }}>
          {customer.person.name}
        </Txt>
        <Txt color={colors.lime} style={{ writingDirection: "ltr" }}>{customer.person.phone}</Txt>
        <Txt color={colors.lime} style={{ writingDirection: "ltr" }}>{customer.person.idNumber}</Txt>
        <Txt color={colors.lime} style={{ marginTop: 8 }}>
          {fingerprintsOf(customer).length} / 2 ·{" "}
          {t(fingerprintsOf(customer).length ? "fpEnrolled" : "fpNotEnrolled")}
        </Txt>
      </Card>
      <Row style={{ marginBottom: 12 }}>
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
                <Txt>
                  {key === "idType"
                    ? t(value === "pnid" ? "pnid" : "enid")
                    : value}
                </Txt>
              </View>
            ))}
        </Disclosure>
      </Card>
      <CustomerEditor customer={customer} />
      {customer.profileAudit?.length ? (
        <Card>
          <Disclosure title={t("auditHistory")} icon="history">
            {customer.profileAudit.map((event, index) => (
              <View key={index} style={{ marginBottom: 16 }}>
                <Txt bold>{event.reason}</Txt>
                <Txt muted size={12}>
                  {formatAuditDate(event.at, app.language, app.gregorian)} ·{" "}
                  {t("changedBy")}: {event.by}
                </Txt>
                {Object.entries(event.changes).map(([key, change]) => (
                  <Txt key={key} size={13}>
                    {t(key as keyof typeof customer.person)}:{" "}
                    {change.before || "—"} → {change.after || "—"}
                  </Txt>
                ))}
              </View>
            ))}
          </Disclosure>
        </Card>
      ) : null}
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
                  {formatAuditDate(event.at, app.language, app.gregorian)} ·{" "}
                  {t("changedBy")}: {event.by}
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
        records
          .slice(0, showHistory ? records.length : 3)
          .map((r) => <RecordRow key={r.id} record={r} />)
      ) : (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      )}
      {records.length > 3 ? (
        <Button
          secondary
          small
          label={t(showHistory ? "close" : "allRecords")}
          onPress={() => setShowHistory(!showHistory)}
        />
      ) : null}
    </Screen>
  );
}
