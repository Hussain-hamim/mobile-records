import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, View } from "react-native";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  Button,
  Card,
  Chip,
  Field,
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
import { formatDate } from "../../domain/format";
import { networkApi, networkPage } from "./api";
import { demoNetwork } from "./demo";
import { networkError, networkText, type NetworkText } from "./strings";
import { NetworkComposer, DeviceDetails } from "./composer";
import type {
  NetworkStatus,
  NetworkSection,
  NetworkShop,
  NetworkKind,
  NetworkRow,
} from "./types";

type Confirm = {
  action: string;
  data: Record<string, unknown>;
  title: string;
  hint?: string;
  reason?: boolean;
};
export function NetworkScreen() {
  const app = useApp();
  return app.membership ? (
    <NetworkSession
      key={`${app.demo}:${app.membership.shopId}:${app.membership.userId}`}
    />
  ) : null;
}
function NetworkSession() {
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
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState<{
      kind: NetworkKind;
    } | null>(null),
    [confirm, setConfirm] = useState<Confirm | null>(null),
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
  const page = useServerPage(
    (offset: number | null, signal: AbortSignal) =>
      networkPage(call, section, offset, query, signal),
    `${shopId}:${section}:${query}:${revision}`,
    section !== "settings" &&
      (!!enabled || section === "connections" || section === "audit"),
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
    setSuccess(false);
    try {
      await call(action, data);
      if (!alive.current) return false;
      setConfirm(null);
      setReason("");
      refresh();
      setSuccess(true);
      return true;
    } catch (e) {
      if (alive.current) setError(networkError(language, e));
      return false;
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function ask(value: Confirm) {
    setReason("");
    setConfirm(value);
    setError("");
  }
  const date = (s: string) => formatDate(s, language, app.gregorian);
  function row(item: NetworkRow) {
    if ("connection_status" in item || "area" in item) {
      const s = item as NetworkShop,
        connected = s.connection_status === "accepted" && !s.blocked;
      return (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Txt bold size={18}>
                {s.name}
              </Txt>
              <Txt muted>{s.area}</Txt>
              {s.contact ? <Txt>{s.contact}</Txt> : null}
            </View>
            <Txt size={11} color={colors.green}>
              {s.status === "approved" ? nt("approved") : nt(s.status)}
            </Txt>
          </Row>
          {s.connection_status === "pending" && (
            <Txt muted>{nt("pending")}</Txt>
          )}
          <Row style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {owner && s.blocked ? (
              <Button
                small
                secondary
                label={nt("unblock")}
                disabled={busy}
                onPress={() =>
                  ask({
                    action: "unblock",
                    data: { target: s.shop_id },
                    title: nt("unblock"),
                  })
                }
              />
            ) : (
              <>
                {owner && !connected && s.connection_status !== "pending" && (
                  <Button
                    small
                    label={nt("connect")}
                    disabled={busy}
                    onPress={() =>
                      ask({
                        action: "connect",
                        data: {
                          target: s.shop_id,
                          version: s.connection_version ?? 0,
                        },
                        title: nt("connect"),
                        hint: `${s.name} · ${profile?.name ?? ""}`,
                      })
                    }
                  />
                )}
                {owner &&
                  s.connection_status === "pending" &&
                  s.requested_by !== shopId && (
                    <Button
                      small
                      label={nt("accept")}
                      disabled={busy}
                      onPress={() =>
                        ask({
                          action: "accept",
                          data: {
                            target: s.shop_id,
                            version: s.connection_version,
                          },
                          title: nt("accept"),
                          hint: s.name,
                        })
                      }
                    />
                  )}
                {owner && (connected || s.connection_status === "pending") && (
                  <Button
                    small
                    secondary
                    disabled={busy}
                    label={nt("disconnect")}
                    onPress={() =>
                      ask({
                        action: "disconnect",
                        data: {
                          target: s.shop_id,
                          version: s.connection_version,
                        },
                        title: nt("disconnect"),
                        hint: nt("disconnectHint"),
                      })
                    }
                  />
                )}
                {owner && (
                  <Button
                    small
                    secondary
                    disabled={busy}
                    label={nt("block")}
                    onPress={() =>
                      ask({
                        action: "block",
                        data: { target: s.shop_id },
                        title: nt("block"),
                        hint: nt("disconnectHint"),
                      })
                    }
                  />
                )}
              </>
            )}
            <Button
              small
              secondary
              label={nt("report")}
              onPress={() =>
                ask({
                  action: "report",
                  data: { target: s.shop_id, id: Crypto.randomUUID() },
                  title: nt("report"),
                  reason: true,
                })
              }
            />
          </Row>
        </Card>
      );
    }
    if ("device" in item)
      return (
        <Card>
          <Txt bold color={colors.green}>
            {nt(item.kind)}
          </Txt>
          <Txt muted>{item.name}</Txt>
          <DeviceDetails device={item.device} />
          <Txt size={12} muted>
            {nt("expires")}: {date(item.expires_at)}
          </Txt>
          <Row style={{ marginTop: 12 }}>
            {item.shop_id === shopId && status.value?.canShare ? (
              <Button
                small
                secondary
                label={nt("closePost")}
                onPress={() =>
                  ask({
                    action: "close-post",
                    data: { id: item.id },
                    title: nt("closePost"),
                  })
                }
              />
            ) : (
              <Button
                small
                secondary
                label={nt("report")}
                onPress={() =>
                  ask({
                    action: "report",
                    data: { target: item.shop_id, id: Crypto.randomUUID() },
                    title: nt("report"),
                    reason: true,
                  })
                }
              />
            )}
          </Row>
        </Card>
      );
    if ("action" in item)
      return (
        <Card>
          <Txt bold>{item.action}</Txt>
          <Txt muted>{date(item.at)}</Txt>
          <Txt size={12}>{JSON.stringify(item.details)}</Txt>
        </Card>
      );
    return null;
  }
  return (
    <Screen scroll={false}>
      <Heading
        title={nt("title")}
        action={
          <Button
            small
            secondary
            label={nt("back")}
            onPress={() => router.back()}
          />
        }
      />
      <Txt muted size={13} style={{ marginBottom: 12 }}>
        {nt("intro")}
      </Txt>
      {app.demo && <Notice message={nt("demo")} />}
      <Row style={{ flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {(["board", "directory", "connections", "settings"] as const).map(
          (s) => (
            <Chip
              key={s}
              active={section === s}
              label={nt(s)}
              onPress={() => {
                setSection(s);
                setQuery("");
                setSuccess(false);
              }}
            />
          ),
        )}
      </Row>
      {(section === "board" || section === "directory") && enabled && (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={nt("search")}
        />
      )}
      <Notice
        message={
          error || (status.error ? networkError(language, status.error) : "")
        }
        tone="error"
      />
      {success && <Notice message={nt("sent")} />}
      {section === "settings" ? (
        <FlatList
          data={[status.value]}
          keyExtractor={() => "settings"}
          renderItem={({ item }) =>
            item ? (
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
            ) : null
          }
          ListFooterComponent={
            <Row style={{ gap: 8 }}>
              <Button secondary small label={nt("refresh")} onPress={refresh} />
              {owner && (
                <Button
                  secondary
                  small
                  label={nt("audit")}
                  onPress={() => setSection("audit")}
                />
              )}
            </Row>
          }
        />
      ) : (
        <>
          {!enabled && section !== "connections" && section !== "audit" ? (
            <Notice message={nt("networkApproval")} />
          ) : null}
          <Row
            style={{
              justifyContent: "space-between",
              gap: 8,
              marginVertical: 10,
            }}
          >
            <Button secondary small label={nt("refresh")} onPress={refresh} />
            {enabled && status.value?.canShare && (
              <Button
                small
                icon="plus"
                label={nt("newPost")}
                onPress={() => setCompose({ kind: "offer" })}
              />
            )}
          </Row>
          <FlatList
            data={page.items}
            renderItem={({ item }) => row(item)}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            ListEmptyComponent={
              !page.loading ? (
                <Txt muted>{nt("empty")}</Txt>
              ) : (
                <Txt muted>{t("loading")}</Txt>
              )
            }
            ListFooterComponent={
              <View style={{ gap: 10, paddingVertical: 12 }}>
                {!!page.error && (
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
                )}
                {page.hasMore && (
                  <Button
                    secondary
                    loading={page.loading}
                    label={nt("more")}
                    onPress={page.loadMore}
                  />
                )}
                <Txt muted size={12}>
                  {nt("privacy")}
                </Txt>
                {section === "directory" && (
                  <Txt muted size={12}>
                    {nt("approvalHint")}
                  </Txt>
                )}
              </View>
            }
          />
        </>
      )}
      {compose && (
        <NetworkComposer
          call={call}
          initialKind={compose.kind}
          onClose={() => setCompose(null)}
          onSaved={() => {
            setCompose(null);
            setSuccess(true);
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
      <Notice message={nt("profileHint")} />
      {p && (
        <Txt bold>
          {nt(p.status)} · {p.enabled ? nt("enable") : nt("disabled")}
        </Txt>
      )}
      {status.owner ? (
        <Card>
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
      {status.owner && (
        <Card>
          <Heading title={nt("staff")} />
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
