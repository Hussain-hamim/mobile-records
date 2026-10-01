import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../state/app-context";
import {
  Card,
  Button,
  Heading,
  Icon,
  Notice,
  Row,
  Screen,
  Txt,
  Empty,
  colors,
} from "../../components/ui";
import { RecordRow } from "../../components/record-row";
import { formatDate, localDay } from "../../domain/format";
export default function Home() {
  const app = useApp();
  const { t } = app;
  const today = app.records.filter(
    (r) => localDay(r.occurredAt) === localDay(new Date().toISOString()),
  );
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <Row>
          <View
            style={{
              backgroundColor: colors.green,
              padding: 10,
              borderRadius: 14,
            }}
          >
            <Icon name="cellphone-check" color="#fff" />
          </View>
          <Txt bold size={14}>
            {t("app")}
          </Txt>
        </Row>
        <View
          style={{
            backgroundColor: colors.mint,
            borderRadius: 30,
            padding: 11,
          }}
        >
          <Icon name="storefront-outline" color={colors.green} />
        </View>
      </Row>
      {app.demo ? <Notice message={t("demoBanner")} /> : null}
      <Heading
        title={app.membership?.profile.shopName || t("home")}
        subtitle={formatDate(
          new Date().toISOString(),
          app.language,
          app.gregorian,
        )}
      />
      <Card
        style={{
          backgroundColor: colors.green,
          borderColor: colors.green,
          padding: 24,
        }}
      >
        <Txt size={12} color="#BBD1C4">
          {t("today")}
        </Txt>
        <Row style={{ justifyContent: "space-between", marginTop: 9 }}>
          <View>
            <Txt size={40} bold color="#fff">
              {String(today.length).padStart(2, "0")}
            </Txt>
            <Txt size={12} color="#D4E2D9">
              {t("records")}
            </Txt>
          </View>
          <View style={{ height: 68, width: 1, backgroundColor: "#507464" }} />
          <View>
            <Txt size={20} bold color="#fff">
              {today.filter((r) => r.direction === "buy").length}
            </Txt>
            <Txt size={11} color="#D4E2D9">
              {t("bought")}
            </Txt>
          </View>
          <View>
            <Txt size={20} bold color="#fff">
              {today.filter((r) => r.direction === "sell").length}
            </Txt>
            <Txt size={11} color="#D4E2D9">
              {t("sold")}
            </Txt>
          </View>
        </Row>
      </Card>
      <Row style={{ marginTop: 5, marginBottom: 24 }}>
        {(["buy", "sell"] as const).map((direction) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            accessibilityLabel={t(direction)}
            onPress={() =>
              router.push({ pathname: "/new-record", params: { direction } })
            }
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: direction === "buy" ? colors.mint : colors.pale,
              borderRadius: 19,
              padding: 21,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon
              name={
                direction === "buy" ? "arrow-bottom-left" : "arrow-top-right"
              }
              size={30}
              color={direction === "buy" ? colors.green : colors.amber}
            />
            <View style={{ height: 13 }} />
            <Txt bold size={17}>
              {t(direction)}
            </Txt>
            <Txt size={11} muted>
              {t("newRecord")}
            </Txt>
          </Pressable>
        ))}
      </Row>
      {app.drafts.length ? (
        <View style={{ marginBottom: 20 }}>
          <Button
            label={t("resume")}
            secondary
            icon="file-edit-outline"
            onPress={() =>
              router.push({
                pathname: "/new-record",
                params: { draft: app.drafts[0].id },
              })
            }
          />
        </View>
      ) : null}
      <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <Txt bold size={18}>
          {t("recent")}
        </Txt>
        <Pressable onPress={() => router.push("/records")}>
          <Txt size={12} color={colors.green}>
            {t("allRecords")} →
          </Txt>
        </Pressable>
      </Row>
      {app.records.length ? (
        <Card style={{ paddingVertical: 0 }}>
          {app.records.slice(0, 4).map((r) => (
            <RecordRow record={r} key={r.id} />
          ))}
        </Card>
      ) : (
        <Empty title={t("empty")} hint={t("emptyHint")} />
      )}
      <Row style={{ marginTop: 12 }}>
        <Icon
          name={
            app.operations.length
              ? "cloud-upload-outline"
              : "cloud-check-outline"
          }
          size={20}
          color={colors.muted}
        />
        <View style={{ flex: 1 }}>
          <Txt size={12} bold>
            {t(app.operations.length ? "pending" : "synced")}
            {app.operations.length ? ` · ${app.operations.length}` : ""}
          </Txt>
          <Txt size={10} muted>
            {t("syncHint")}
          </Txt>
        </View>
        {!app.demo ? (
          <Button
            small
            label={t("sync")}
            secondary
            loading={app.syncing}
            onPress={() => void app.sync()}
          />
        ) : null}
      </Row>
    </Screen>
  );
}
