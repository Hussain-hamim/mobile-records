import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
  type ColorValue,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../state/app-context";
import type { TextKey } from "../i18n/strings";
export const colors = {
  bg: "#F5F6F0",
  paper: "#FFFFFF",
  ink: "#1E342E",
  muted: "#748077",
  green: "#245847",
  mint: "#DDECE1",
  line: "#E3E8DF",
  amber: "#9C642B",
  pale: "#F6EDDE",
  red: "#AE483B",
};
export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export function Icon({
  name,
  size = 22,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
export function Txt({
  children,
  size = 15,
  muted = false,
  bold = false,
  color,
  style,
}: {
  children: ReactNode;
  size?: number;
  muted?: boolean;
  bold?: boolean;
  color?: string;
  style?: ComponentProps<typeof Text>["style"];
}) {
  const { rtl } = useApp();
  return (
    <Text
      style={[
        {
          fontFamily: "Noto",
          fontSize: size,
          lineHeight: size * 1.65,
          color: color ?? (muted ? colors.muted : colors.ink),
          fontWeight: bold ? "700" : "400",
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { rtl } = useApp();
  return (
    <View
      style={[
        {
          flexDirection: rtl ? "row-reverse" : "row",
          alignItems: "center",
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: 24 }}>
      <View style={{ flex: 1 }}>
        <Txt size={29} bold>
          {title}
        </Txt>
        {subtitle ? (
          <Txt muted size={13}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {action}
    </Row>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  loading = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? colors.mint : colors.green,
          paddingVertical: small ? 8 : 13,
          opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Row style={{ justifyContent: "center", gap: 8 }}>
        {loading ? (
          <ActivityIndicator color={secondary ? colors.green : "#fff"} />
        ) : icon ? (
          <Icon
            name={icon}
            color={secondary ? colors.green : "#fff"}
            size={20}
          />
        ) : null}
        <Txt
          size={small ? 12 : 14}
          bold
          color={secondary ? colors.green : "#fff"}
        >
          {label}
        </Txt>
      </Row>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  multiline = false,
  ...rest
}: TextInputProps & { label: string; numeric?: boolean }) {
  const { rtl } = useApp();
  return (
    <View style={{ gap: 5, marginBottom: 14 }}>
      <Txt size={12} muted>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="#A0ABA3"
        style={[
          styles.input,
          {
            textAlign: numeric ? "left" : rtl ? "right" : "left",
            writingDirection: numeric ? "ltr" : rtl ? "rtl" : "ltr",
            minHeight: multiline ? 88 : 51,
          },
        ]}
        {...rest}
      />
    </View>
  );
}
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        borderRadius: 24,
        paddingVertical: 7,
        paddingHorizontal: 16,
        backgroundColor: active ? colors.green : colors.paper,
        borderWidth: 1,
        borderColor: active ? colors.green : colors.line,
      }}
    >
      <Txt size={12} color={active ? "#fff" : colors.muted} bold={active}>
        {label}
      </Txt>
    </Pressable>
  );
}
export function Notice({
  message,
  tone = "info",
}: {
  message: string;
  tone?: "info" | "error";
}) {
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 13,
        backgroundColor: tone === "error" ? "#FBECE7" : colors.pale,
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      <Txt size={12} color={tone === "error" ? colors.red : colors.amber}>
        {message}
      </Txt>
    </View>
  );
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
      <View
        style={{ padding: 20, borderRadius: 28, backgroundColor: colors.mint }}
      >
        <Icon
          name="book-open-page-variant-outline"
          size={36}
          color={colors.green}
        />
      </View>
      <Txt bold>{title}</Txt>
      {hint ? (
        <Txt size={13} muted style={{ textAlign: "center", maxWidth: 280 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}
export function errorText(error: unknown, t: (k: TextKey) => string) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    return t(message as TextKey);
  } catch {
    return message;
  }
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 22,
    paddingBottom: 32,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 14,
  },
  button: {
    borderRadius: 14,
    paddingHorizontal: 17,
    minHeight: 44,
    justifyContent: "center",
  },
  input: {
    backgroundColor: "#FAFBF8",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Noto",
    fontSize: 15,
    color: colors.ink,
  },
});
