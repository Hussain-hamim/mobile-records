import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  Button,
  Card,
  Chip,
  Field,
  Empty,
  IconButton,
  Heading,
  Notice,
  Row,
  Screen,
  SearchField,
  Txt,
  colors,
} from "../../components/ui";
import { useApp } from "../../state/app-context";
import { useShopQuery } from "../../state/use-shop-query";
import { useServerPage } from "../../state/use-server-page";
import { networkApi, networkPage } from "./api";
import { demoNetwork } from "./demo";
import { networkError, networkText, type NetworkText } from "./strings";
import { NetworkComposer } from "./composer";
import { NetworkBadge, NetworkCard } from "./network-card";
import { useSuccessFeedback } from "../../components/success-feedback";
import type {
  NetworkStatus,
  NetworkSection,
  NetworkConfirmation,
  NetworkKind,
} from "./types";

export function NetworkScreen() {
  const app = useApp();
  return app.membership ? (
    <NetworkSession
      key={`${app.demo}:${app.membership.shopId}:${app.membership.userId}`}
    />
  ) : null;
}
function NetworkSession() {
  const showSuccess = useSuccessFeedback();
  const app = useApp(),
    { membership, language, t } = app,
    shopId = membership!.shopId;
  const nt = (k: NetworkText) => networkText(language, k);
  const call = useMemo(
    () => (app.demo ? demoNetwork(shopId) : networkApi(shopId)),
    [app.demo, shopId],
  );
  const [section, setSection] = useState<NetworkSection | "settings">("board"),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState<{
      kind: NetworkKind;
    } | null>(null),
    [confirm, setConfirm] = useState<NetworkConfirmation | null>(null),
    [expandedId, setExpandedId] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const alive = useRef(true),
    running = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const status = useShopQuery(
    () => call<NetworkStatus>("status"),
    `${shopId}:${revision}`,
  );
  const profile = status.value?.profile,
    enabled = profile?.enabled && profile.status === "approved",
    owner = status.value?.owner;
  const canList =
    section !== "settings" &&
    !status.loading &&
    !status.error &&
    (!!enabled ||
      section === "connections" ||
      (section === "audit" && !!owner));
  const page = useServerPage(
    (offset: number | null, signal: AbortSignal) =>
      networkPage(call, section, offset, query, signal),
    `${shopId}:${section}:${query}:${revision}`,
    canList,
  );
  const refresh = () => {
    setRevision((n) => n + 1);
    setError("");
  };
  async function mutate(action: string, data: Record<string, unknown>) {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await call(action, data);
      if (!alive.current) return false;
      setConfirm(null);
      setReason("");
      refresh();
      showSuccess(nt("sent"), {
        confetti:
          ["profile", "connect", "accept"].includes(action) ||
          (action === "permission" && data.enabled === true),
      });
      return true;
    } catch (e) {
      if (alive.current) setError(networkError(language, e));
      return false;
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function ask(value: NetworkConfirmation) {
    setReason("");
    setConfirm(value);
    setError("");
  }
  function navigate(next: NetworkSection | "settings") {
    setSection(next);
    setQuery("");
    setExpandedId(null);
    setError("");
  }
  const mainSection = section !== "settings" && section !== "audit";
  const messages = (
    <>
      {app.demo ? (
        <Txt size={11} muted style={{ marginBottom: 12 }}>
          {nt("demo")}
        </Txt>
      ) : null}
      <Notice
        message={
          error || (status.error ? networkError(language, status.error) : "")
        }
        tone="error"
      />
    </>
  );
  return (
    <Screen scroll={false}>
      <Row style={{ marginBottom: 16, gap: 10 }}>
        <IconButton
          icon={app.rtl ? "arrow-right" : "arrow-left"}
          label={nt("back")}
          onPress={() => {
            if (section === "audit") navigate("settings");
            else if (section === "settings") navigate("board");
            else router.back();
          }}
        />
        <Txt bold size={21} style={{ flex: 1 }}>
          {nt(mainSection ? "title" : section)}
        </Txt>
        {section !== "settings" ? (
          <IconButton
            icon="cog-outline"
            label={nt("settings")}
            onPress={() => navigate("settings")}
          />
        ) : null}
      </Row>
      {mainSection ? (
        <Row
          style={{
            gap: 4,
            padding: 4,
            backgroundColor: colors.paper,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.line,
            marginBottom: 14,
          }}
        >
          {(["board", "directory", "connections"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={nt(value)}
              aria-selected={section === value}
              onPress={() => navigate(value)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 4,
                paddingVertical: 8,
                borderRadius: 9,
                backgroundColor:
                  section === value
                    ? colors.green
                    : pressed
                      ? colors.mint
                      : "transparent",
              })}
            >
              <Txt
                size={12}
                bold={section === value}
                color={section === value ? "#fff" : colors.muted}
                style={{ textAlign: "center" }}
              >
                {nt(
                  value === "board"
                    ? "phones"
                    : value === "directory"
                      ? "shops"
                      : value,
                )}
              </Txt>
            </Pressable>
          ))}
        </Row>
      ) : null}
      {mainSection && (enabled || section === "connections") ? (
        <SearchField
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setExpandedId(null);
          }}
          placeholder={nt(section === "board" ? "searchPhones" : "searchShops")}
        />
      ) : null}
      {section === "settings" ? (
        <FlatList
          style={{ flex: 1 }}
          data={status.value ? [status.value] : []}
          keyExtractor={() => "settings"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={messages}
          ListEmptyComponent={
            status.loading ? <ActivityIndicator color={colors.green} /> : null
          }
          renderItem={({ item }) => (
            <NetworkSettings
              key={item.profile?.version ?? 0}
              status={item}
              busy={busy}
              onSave={(data) => mutate("profile", data)}
              onPermission={(target, allow) =>
                ask({
                  action: "permission",
                  data: { target, enabled: allow },
                  title: nt(allow ? "grant" : "revoke"),
                })
              }
            />
          )}
          ListFooterComponent={
            <View style={{ gap: 12, paddingVertical: 12 }}>
              {owner ? (
                <Button
                  secondary
                  icon="history"
                  label={nt("audit")}
                  onPress={() => navigate("audit")}
                />
              ) : null}
              <Button variant="text" label={nt("refresh")} onPress={refresh} />
              <Txt muted size={12}>
                {nt("privacy")}
              </Txt>
            </View>
          }
        />
      ) : (
        <FlatList
          key={section}
          data={page.items}
          renderItem={({ item }) => (
            <NetworkCard
              item={item}
              shopId={shopId}
              owner={!!owner}
              canShare={!!status.value?.canShare}
              busy={busy}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((previous) =>
                  previous === item.id ? null : item.id,
                )
              }
              onAction={ask}
            />
          )}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          refreshing={
            status.loading || (page.loading && page.items.length === 0)
          }
          onRefresh={refresh}
          ListHeaderComponent={
            <View>
              {messages}
              <Row
                style={{ justifyContent: "space-between", marginBottom: 12 }}
              >
                <Txt muted size={12}>
                  {nt(section)}
                  {page.items.length
                    ? ` · ${nt("shown")}: ${page.items.length}`
                    : ""}
                </Txt>
                <IconButton
                  icon="refresh"
                  label={nt("refresh")}
                  onPress={refresh}
                />
              </Row>
              {section === "board" && enabled && status.value?.canShare ? (
                <View style={{ marginBottom: 16 }}>
                  <Button
                    icon="plus"
                    label={nt("newPost")}
                    onPress={() => setCompose({ kind: "offer" })}
                  />
                </View>
              ) : null}
              {!status.loading &&
              !status.error &&
              !enabled &&
              section !== "connections" &&
              section !== "audit" ? (
                <Card style={{ gap: 12 }}>
                  <Txt>{nt("networkApproval")}</Txt>
                  {owner ? (
                    <Button
                      secondary
                      label={nt("settings")}
                      onPress={() => navigate("settings")}
                    />
                  ) : null}
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            status.loading || page.loading ? (
              <View style={{ paddingVertical: 32, gap: 12 }}>
                <ActivityIndicator color={colors.green} />
                <Txt muted style={{ textAlign: "center" }}>
                  {t("loading")}
                </Txt>
              </View>
            ) : canList && !page.error ? (
              <View style={{ paddingBottom: 16 }}>
                <Empty
                  title={nt(
                    query
                      ? "noResults"
                      : section === "board"
                        ? "boardEmpty"
                        : section === "connections"
                          ? "connectionsEmpty"
                          : "empty",
                  )}
                  hint={
                    query
                      ? nt("searchHint")
                      : section === "board"
                        ? nt("boardHint")
                        : section === "connections"
                          ? nt("connectionsHint")
                          : undefined
                  }
                />
                {!query &&
                enabled &&
                (section === "board" || section === "connections") ? (
                  <Button
                    secondary
                    label={nt("directory")}
                    onPress={() => navigate("directory")}
                  />
                ) : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            <View style={{ gap: 12, paddingVertical: 12 }}>
              {page.error ? (
                <>
                  <Notice
                    message={networkError(language, page.error)}
                    tone="error"
                  />
                  <Button
                    secondary
                    label={nt("refresh")}
                    onPress={page.retry}
                  />
                </>
              ) : page.hasMore ? (
                <Button
                  secondary
                  loading={page.loading}
                  label={nt("more")}
                  onPress={page.loadMore}
                />
              ) : page.items.length > 0 && !page.loading ? (
                <Txt muted size={12} style={{ textAlign: "center" }}>
                  {nt("allLoaded")}
                </Txt>
              ) : null}
              <Txt muted size={11}>
                {nt("privacy")}
              </Txt>
              {section === "directory" ? (
                <Txt muted size={11}>
                  {nt("approvalHint")}
                </Txt>
              ) : null}
            </View>
          }
        />
      )}
      {compose && (
        <NetworkComposer
          call={call}
          initialKind={compose.kind}
          onClose={() => setCompose(null)}
          onSaved={() => {
            setCompose(null);
            showSuccess(nt("phoneShared"));
            refresh();
          }}
        />
      )}
      {confirm && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => !busy && setConfirm(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#102B2466",
              justifyContent: "center",
              padding: 22,
            }}
          >
            <Card>
              <Heading title={confirm.title} />
              <Txt>{confirm.hint ?? nt("confirmAction")}</Txt>
              {confirm.reason && (
                <Field
                  label={nt("reason")}
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  multiline
                />
              )}
              <Notice message={error} tone="error" />
              <Row style={{ gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <Button
                  secondary
                  disabled={busy}
                  label={nt("close")}
                  onPress={() => setConfirm(null)}
                />
                <Button
                  loading={busy}
                  disabled={!!confirm.reason && reason.trim().length < 3}
                  label={nt("send")}
                  onPress={() =>
                    void mutate(confirm.action, {
                      ...confirm.data,
                      ...(confirm.reason ? { reason } : {}),
                    })
                  }
                />
              </Row>
            </Card>
          </View>
        </Modal>
      )}
    </Screen>
  );
}
function NetworkSettings({
  status,
  busy,
  onSave,
  onPermission,
}: {
  status: NetworkStatus;
  busy: boolean;
  onSave: (d: Record<string, unknown>) => Promise<boolean>;
  onPermission: (id: string, allow: boolean) => void;
}) {
  const { language } = useApp(),
    nt = (k: NetworkText) => networkText(language, k),
    p = status.profile;
  const [name, setName] = useState(p?.name ?? ""),
    [area, setArea] = useState(p?.area ?? ""),
    [contact, setContact] = useState(p?.contact ?? ""),
    [enabled, setEnabled] = useState(p?.enabled ?? true),
    [preview, setPreview] = useState(false);
  return (
    <>
      {p ? (
        <Row style={{ flexWrap: "wrap", marginBottom: 16 }}>
          <NetworkBadge label={nt(p.status)} muted={p.status !== "approved"} />
          {!p.enabled ? <NetworkBadge label={nt("disabled")} muted /> : null}
        </Row>
      ) : null}
      {status.owner ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Txt muted size={13}>
            {nt("profileHint")}
          </Txt>
          {preview ? (
            <>
              <Txt bold>{nt("preview")}</Txt>
              <Txt>
                {name} · {area}
              </Txt>
              <Txt>{contact}</Txt>
              <Notice message={nt("profileHint")} />
              <Button
                secondary
                disabled={busy}
                label={nt("back")}
                onPress={() => setPreview(false)}
              />
              <Button
                loading={busy}
                label={nt("submit")}
                onPress={() =>
                  void onSave({
                    name,
                    area,
                    contact,
                    enabled,
                    version: p?.version ?? 0,
                  })
                }
              />
            </>
          ) : (
            <>
              <Field
                label={nt("name")}
                value={name}
                maxLength={80}
                onChangeText={setName}
              />
              <Field
                label={nt("area")}
                value={area}
                maxLength={100}
                onChangeText={setArea}
              />
              <Field
                label={nt("contact")}
                value={contact}
                maxLength={60}
                onChangeText={setContact}
              />
              <Chip
                active={enabled}
                label={nt("enable")}
                onPress={() => setEnabled((v) => !v)}
              />
              <Button
                disabled={!name.trim() || !area.trim()}
                label={nt("preview")}
                onPress={() => setPreview(true)}
              />
            </>
          )}
        </Card>
      ) : (
        <Notice message={nt("readOnly")} />
      )}
      {status.owner &&
        status.members.some((member) => member.role === "staff") && (
          <Card style={{ padding: 16, gap: 12 }}>
            <Txt bold size={17}>
              {nt("staff")}
            </Txt>
            {status.members
              .filter((m) => m.role === "staff")
              .map((m) => (
                <View key={m.user_id} style={{ gap: 8, marginBottom: 14 }}>
                  <Txt size={12}>{m.phone || m.user_id}</Txt>
                  <Button
                    secondary
                    small
                    disabled={busy}
                    label={nt(m.can_share ? "revoke" : "grant")}
                    onPress={() => onPermission(m.user_id, !m.can_share)}
                  />
                </View>
              ))}
          </Card>
        )}
    </>
  );
}
