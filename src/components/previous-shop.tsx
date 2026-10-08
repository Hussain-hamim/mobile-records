import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Linking, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApp } from "../state/app-context";
import {
  PreviousShopSession,
  previousShopImeis,
  hasPreviousShopHistory,
  type PreviousShopState,
} from "../domain/previous-shop";
import { requestPreviousShop } from "../services/previous-shop";
import { formatDate } from "../domain/format";
import { digits } from "../domain/validation";
import { Button, Card, Chip, Notice, SectionTitle, Txt } from "./ui";
import type { TextKey } from "../i18n/strings";
import {
  demoPreviousShopResult,
  type DemoPreviousShopScenario,
} from "../data/demo-previous-shop";

export type PreviousShopTrigger = { imeis: string[]; nonce: number };
export function PreviousShop({
  imeis,
  trigger,
}: {
  imeis: string[];
  trigger?: PreviousShopTrigger;
}) {
  const app = useApp();
  const [scenario, setScenario] = useState<DemoPreviousShopScenario>("history");
  const input = JSON.stringify(imeis);
  const normalized = previousShopImeis(imeis);
  const previewScenario =
    normalized.length < 2 && scenario === "different" ? "history" : scenario;
  if (!app.membership || app.phase !== "ready" || !normalized.length)
    return null;
  const auto =
    trigger &&
    JSON.stringify(previousShopImeis(trigger.imeis)) ===
      JSON.stringify(normalized)
      ? trigger.nonce
      : 0;
  return (
    <PreviousShopContent
      key={`${app.membership.userId}:${app.membership.shopId}:${input}:${auto}:${app.demo ? previewScenario : "live"}`}
      shopId={app.membership.shopId}
      imeis={normalized}
      demoScenario={app.demo ? previewScenario : undefined}
      demoControls={
        app.demo ? (
          <View style={{ gap: 8, marginBottom: 8 }}>
            <Notice message={app.t("previousShopDemo")} />
            <View
              style={{
                flexDirection: app.rtl ? "row-reverse" : "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <Chip
                label={app.t("previousShopDemoHistory")}
                active={previewScenario === "history"}
                onPress={() => setScenario("history")}
              />
              {normalized.length > 1 && (
                <Chip
                  label={app.t("previousShopDemoDifferent")}
                  active={scenario === "different"}
                  onPress={() => setScenario("different")}
                />
              )}
              <Chip
                label={app.t("previousShopEmpty")}
                active={scenario === "empty"}
                onPress={() => setScenario("empty")}
              />
            </View>
          </View>
        ) : undefined
      }
    />
  );
}
function PreviousShopContent({
  shopId,
  imeis,
  demoScenario,
  demoControls,
}: {
  shopId: string;
  imeis: string[];
  demoScenario?: DemoPreviousShopScenario;
  demoControls?: ReactNode;
}) {
  const [session] = useState(
    () =>
      new PreviousShopSession((lookup) =>
        demoScenario
          ? Promise.resolve(
              lookup
                ? demoPreviousShopResult(imeis, demoScenario)
                : { enabled: true },
            )
          : requestPreviousShop(shopId, lookup ? imeis : undefined),
      ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.snapshot,
  );
  useFocusEffect(
    useCallback(() => {
      void session.run(true);
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") void session.run();
        else session.clear();
      });
      return () => {
        listener.remove();
        session.clear();
      };
    }, [session]),
  );
  return (
    <PreviousShopView
      state={state}
      imeis={imeis}
      onCheck={() => void session.run(true)}
      demoControls={demoControls}
      disableCalls={Boolean(demoScenario)}
    />
  );
}
export function PreviousShopView({
  state,
  imeis,
  onCheck,
  demoControls,
  disableCalls = false,
}: {
  state: PreviousShopState;
  imeis: string[];
  onCheck: () => void;
  demoControls?: ReactNode;
  disableCalls?: boolean;
}) {
  const { t, language, gregorian } = useApp();
  const [callError, setCallError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!hasPreviousShopHistory(state)) return null;
  const missing = imeis.filter(
    (imei) => !state.matches.some((m) => m.imeis.includes(imei)),
  );
  const details = (
    <>
      {demoControls}
      {state.status === "disabled" ? (
        <Txt muted>{t("previousShopDisabled")}</Txt>
      ) : (
        <>
          <Button
            small
            secondary
            icon="store-search-outline"
            label={t(
              state.status === "error"
                ? "previousShopRetry"
                : "previousShopCheck",
            )}
            loading={state.status === "loading"}
            onPress={onCheck}
          />
          {state.status === "loading" && (
            <Txt muted>{t("previousShopLoading")}</Txt>
          )}
          {state.status === "error" && (
            <Notice tone="error" message={t(state.error as TextKey)} />
          )}
          {state.status === "result" && (
            <View style={{ gap: 12, marginTop: 8 }}>
              {state.matches.map((match) => (
                <View key={match.imeis.join(":")} style={{ gap: 4 }}>
                  <Txt muted size={12} style={{ writingDirection: "ltr" }}>
                    IMEI: {match.imeis.join(" / ")}
                  </Txt>
                  <Txt bold>{match.shopName || t("previousShopUnnamed")}</Txt>
                  <Txt>{match.address || t("previousShopNoAddress")}</Txt>
                  <Txt muted>
                    {formatDate(match.occurredAt, language, gregorian)} ·{" "}
                    {t(
                      match.direction === "buy"
                        ? "previousShopBought"
                        : "previousShopSold",
                    )}
                  </Txt>
                  {match.phone ? (
                    <>
                      <Txt style={{ writingDirection: "ltr" }}>
                        {match.phone}
                      </Txt>
                      <Button
                        small
                        secondary
                        icon="phone-outline"
                        label={t("previousShopCall")}
                        disabled={disableCalls}
                        onPress={() => {
                          if (disableCalls) return;
                          setCallError(false);
                          const number = digits(match.phone).replace(
                            /[^+0-9]/g,
                            "",
                          );
                          if (!number) {
                            setCallError(true);
                            return;
                          }
                          void Linking.openURL(`tel:${number}`).catch(() =>
                            setCallError(true),
                          );
                        }}
                      />
                    </>
                  ) : (
                    <Txt muted>{t("previousShopNoPhone")}</Txt>
                  )}
                </View>
              ))}
              {missing.map((imei) => (
                <View key={imei}>
                  <Txt muted size={12} style={{ writingDirection: "ltr" }}>
                    IMEI: {imei}
                  </Txt>
                  <Txt>{t("previousShopEmpty")}</Txt>
                </View>
              ))}
            </View>
          )}
          {callError && (
            <Notice message={t("previousShopCallFailed")} tone="error" />
          )}
        </>
      )}
      <Txt muted size={12} style={{ marginTop: 8 }}>
        {t("previousShopDisclaimer")}
      </Txt>
    </>
  );
  return (
    <Card>
      <SectionTitle title={t("previousShopTitle")} icon="store-outline" />
      {state.status === "result" ? (
        <>
          {expanded ? (
            details
          ) : (
            <Txt size={14} muted>
              {state.matches.length
                ? [
                    ...new Set(
                      state.matches.map(
                        (match) => match.shopName || t("previousShopUnnamed"),
                      ),
                    ),
                  ].join(" · ")
                : t("previousShopEmpty")}
            </Txt>
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              {state.matches.map((match) => (
                <View
                  key={match.imeis.join(":")}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {match.shopNumber?.trim() ? (
                    <Txt size={12} bold style={{ writingDirection: "ltr" }}>
                      #{digits(match.shopNumber).replace(/^#+/, "").trim()}
                    </Txt>
                  ) : null}
                  <Txt size={12} muted numberOfLines={1} style={{ flex: 1 }}>
                    {match.address || t("previousShopNoAddress")}
                  </Txt>
                </View>
              ))}
            </View>
            <Button
              small
              secondary
              label={t(
                expanded
                  ? "previousShopHideDetails"
                  : "previousShopFullDetails",
              )}
              icon={expanded ? "chevron-up" : "chevron-down"}
              onPress={() => setExpanded((value) => !value)}
            />
          </View>
        </>
      ) : (
        details
      )}
    </Card>
  );
}
