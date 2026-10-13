import * as Crypto from "expo-crypto";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Icon, Row, Txt, colors } from "../../components/ui";
import { useApp } from "../../state/app-context";
import { formatDate } from "../../domain/format";
import { networkText, type NetworkText } from "./strings";
import type { NetworkConfirmation, NetworkRow, NetworkShop } from "./types";

export function NetworkBadge({
  label,
  muted = false,
}: {
  label: string;
  muted?: boolean;
}) {
  return (
    <View style={[styles.badge, muted && { backgroundColor: colors.bg }]}>
      <Txt size={11} bold color={muted ? colors.muted : colors.green}>
        {label}
      </Txt>
    </View>
  );
}

const activityLabels: Record<string, NetworkText> = {
  profile: "profileUpdated",
  connect: "connectionRequested",
  accept: "connectionAccepted",
  disconnect: "connectionEnded",
  block: "shopBlocked",
  unblock: "shopUnblocked",
  report: "reportSent",
  post: "phoneShared",
  "close-post": "listingClosed",
  permission: "accessUpdated",
};

export function NetworkCard({
  item,
  shopId,
  owner,
  canShare,
  busy,
  expanded,
  onToggle,
  onAction,
}: {
  item: NetworkRow;
  shopId: string;
  owner: boolean;
  canShare: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAction: (value: NetworkConfirmation) => void;
}) {
  const { language, gregorian } = useApp();
  const nt = (k: NetworkText) => networkText(language, k);
  const date = (value: string) => formatDate(value, language, gregorian);
  const options = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nt(expanded ? "hideOptions" : "options")}
      aria-expanded={expanded}
      aria-disabled={busy}
      disabled={busy}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.options,
        pressed && { backgroundColor: colors.mint },
      ]}
    >
      <Icon
        name={expanded ? "chevron-up" : "dots-horizontal"}
        color={colors.muted}
      />
    </Pressable>
  );
  function report(target: string) {
    onAction({
      action: "report",
      data: { target, id: Crypto.randomUUID() },
      title: nt("report"),
      reason: true,
    });
  }
  if ("area" in item) {
    const shop = item as NetworkShop;
    const connected = shop.connection_status === "accepted" && !shop.blocked;
    const pending = shop.connection_status === "pending" && !shop.blocked;
    const incoming = pending && shop.requested_by !== shopId;
    const primary =
      owner && !shop.blocked && (incoming || (!connected && !pending));
    const action = (
      name: "connect" | "accept" | "disconnect" | "block" | "unblock",
    ) =>
      onAction({
        action: name,
        data: { target: shop.shop_id, version: shop.connection_version ?? 0 },
        title: nt(name),
        hint:
          name === "disconnect" || name === "block"
            ? nt("disconnectHint")
            : shop.name,
      });
    return (
      <Card style={styles.card}>
        <Row style={{ alignItems: "flex-start", gap: 8 }}>
          <View style={styles.shopIcon}>
            <Icon name="storefront-outline" color={colors.green} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt bold size={17}>
              {shop.name}
            </Txt>
            <Txt muted size={13}>
              {shop.area}
            </Txt>
          </View>
          {options}
        </Row>
        <Row style={{ flexWrap: "wrap", gap: 6 }}>
          <NetworkBadge
            label={nt(shop.status === "approved" ? "approved" : shop.status)}
            muted={shop.status !== "approved"}
          />
          {shop.blocked ? (
            <NetworkBadge label={nt("blocked")} muted />
          ) : connected ? (
            <NetworkBadge label={nt("accepted")} />
          ) : pending ? (
            <NetworkBadge
              label={nt(incoming ? "incomingRequest" : "requestSent")}
              muted
            />
          ) : null}
        </Row>
        {shop.contact ? (
          <Txt size={13} muted>
            {shop.contact}
          </Txt>
        ) : null}
        {primary ? (
          <Button
            small
            secondary={!incoming}
            disabled={busy}
            label={nt(incoming ? "accept" : "connect")}
            onPress={() => action(incoming ? "accept" : "connect")}
          />
        ) : null}
        {expanded ? (
          <View style={styles.actions}>
            {owner && shop.blocked ? (
              <Button
                small
                secondary
                disabled={busy}
                label={nt("unblock")}
                onPress={() => action("unblock")}
              />
            ) : null}
            {owner && !shop.blocked && (connected || pending) ? (
              <Button
                small
                secondary
                disabled={busy}
                label={nt("disconnect")}
                onPress={() => action("disconnect")}
              />
            ) : null}
            {owner && !shop.blocked ? (
              <Button
                small
                variant="text"
                disabled={busy}
                label={nt("block")}
                onPress={() => action("block")}
              />
            ) : null}
            <Button
              small
              variant="text"
              disabled={busy}
              label={nt("report")}
              onPress={() => report(shop.shop_id)}
            />
          </View>
        ) : null}
      </Card>
    );
  }
  if ("device" in item) {
    const mine = item.shop_id === shopId;
    return (
      <Card style={styles.card}>
        <Row style={{ justifyContent: "space-between" }}>
          <NetworkBadge label={nt(item.kind)} muted={item.kind === "request"} />
          {!mine || canShare ? options : null}
        </Row>
        <View style={{ gap: 5 }}>
          <Txt bold size={21}>
            {item.device.brand} {item.device.model}
          </Txt>
          {[item.device.color, item.device.storage].some(Boolean) ? (
            <Txt muted size={13}>
              {[item.device.color, item.device.storage]
                .filter(Boolean)
                .join(" · ")}
            </Txt>
          ) : null}
          {item.device.price ? (
            <Txt bold size={19} color={colors.green}>
              {item.device.price} AFN
            </Txt>
          ) : null}
        </View>
        <View style={styles.meta}>
          <Txt size={13}>{item.name}</Txt>
          <Txt muted size={11}>
            {nt("expires")}: {date(item.expires_at)}
          </Txt>
        </View>
        {expanded ? (
          <View style={styles.actions}>
            {mine && canShare ? (
              <Button
                small
                secondary
                disabled={busy}
                label={nt("closePost")}
                onPress={() =>
                  onAction({
                    action: "close-post",
                    data: { id: item.id },
                    title: nt("closePost"),
                  })
                }
              />
            ) : !mine ? (
              <Button
                small
                variant="text"
                disabled={busy}
                label={nt("report")}
                onPress={() => report(item.shop_id)}
              />
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  }
  return (
    <Card style={styles.card}>
      <Row style={{ alignItems: "flex-start" }}>
        <Icon name="history" color={colors.muted} size={20} />
        <View style={{ flex: 1, gap: 5 }}>
          <Txt bold>{nt(activityLabels[item.action] ?? "audit")}</Txt>
          <Txt size={12} muted>
            {date(item.at)}
          </Txt>
          {Array.isArray(item.details.recipients) ? (
            <Txt size={12} muted>
              {nt("to")}: {item.details.recipients.length} · {nt("shops")}
            </Txt>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  badge: {
    backgroundColor: colors.mint,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 1,
  },
  shopIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mint,
  },
  options: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -6,
    marginHorizontal: -6,
  },
  actions: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
  meta: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
  },
});
