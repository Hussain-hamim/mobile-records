import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
    Children,
    useEffect,
    useRef,
    useState,
    type ComponentProps,
    type ReactNode,
} from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type ColorValue,
    type TextInputProps,
    type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Language } from "../domain/models";
import { digits } from "../domain/validation";
import type { TextKey } from "../i18n/strings";
import { useApp } from "../state/app-context";
export const colors = {
  bg: "#F5F6FC",
  paper: "#FFFFFF",
  ink: "#20233D",
  muted: "#72768C",
  green: "#4F54E8",
  mint: "#ECECFF",
  line: "#E8EAF3",
  amber: "#9E4F2D",
  pale: "#FFF0E6",
  red: "#BE3D51",
  navy: "#252945",
  peach: "#FFD5BC",
  success: "#287D64",
  lime: "#DDF4AA",
};
export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export function scriptFont(language: Language) {
  return language === "ps" ? "BahijBaraem" : language === "fa" ? "Noto" : undefined;
}
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
  const { rtl, language } = useApp();
  const family = scriptFont(language);
  const pashto = family === "BahijBaraem";
  return (
    <Text
      style={[
        {
          fontSize: size,
          lineHeight: size * (rtl ? 1.8 : 1.35),
          color: color ?? (muted ? colors.muted : colors.ink),
          fontWeight: pashto ? undefined : bold ? "700" : "400",
          letterSpacing: bold && !rtl ? -0.4 : 0,
          textAlign: rtl ? "right" : "left",
          writingDirection: rtl ? "rtl" : "ltr",
        },
        style,
        pashto ? { fontFamily: family, fontWeight: "normal" } : { fontFamily: family },
      ]}
    >
      {Children.map(children, (child) =>
        typeof child === "string" ? digits(child) : child,
      )}
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
  resetKey,
}: {
  children: ReactNode;
  scroll?: boolean;
  resetKey?: string | number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
        <Txt size={30} bold>
          {title}
        </Txt>
        {subtitle ? (
          <Txt muted size={14}>
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
          paddingVertical: small ? 10 : 16,
          transform: [{ scale: pressed ? 0.98 : 1 }],
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
          size={small ? 13 : 15}
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
  const { rtl, language } = useApp();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8, marginBottom: 18 }}>
      <Txt size={13} bold>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        value={value == null || rest.secureTextEntry ? value : digits(value)}
        onChangeText={
          onChangeText
            ? (text) => onChangeText(rest.secureTextEntry ? text : digits(text))
            : undefined
        }
        multiline={multiline}
        placeholderTextColor="#969AAF"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            fontFamily: numeric ? undefined : scriptFont(language),
            fontWeight: language === "ps" && !numeric ? "normal" : undefined,
            borderColor: focused ? colors.green : colors.line,
            backgroundColor: focused ? colors.paper : "#F8F9FD",
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
        minHeight: 44,
        justifyContent: "center",
        paddingVertical: 9,
        paddingHorizontal: 16,
        backgroundColor: active ? colors.green : colors.paper,
        borderWidth: 1,
        borderColor: active ? colors.green : colors.line,
      }}
    >
      <Txt size={13} color={active ? "#fff" : colors.muted} bold={active}>
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
export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.mint : colors.paper,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Icon name={icon} size={23} color={colors.green} />
    </Pressable>
  );
}
export function SectionTitle({
  title,
  icon,
  hint,
}: {
  title: string;
  icon?: IconName;
  hint?: string;
}) {
  return (
    <Row style={{ marginBottom: 18 }}>
      {icon ? (
        <View
          style={{
            padding: 10,
            borderRadius: 13,
            backgroundColor: colors.mint,
          }}
        >
          <Icon name={icon} size={21} color={colors.green} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt size={17} bold>
          {title}
        </Txt>
        {hint ? (
          <Txt size={12} muted>
            {hint}
          </Txt>
        ) : null}
      </View>
    </Row>
  );
}
export function Disclosure({
  title,
  hint,
  icon,
  children,
  initiallyOpen = false,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ paddingVertical: 12, minHeight: 48 }}
      >
        <Row>
          {icon ? (
            <View
              style={{
                padding: 10,
                borderRadius: 13,
                backgroundColor: colors.mint,
              }}
            >
              <Icon name={icon} color={colors.green} size={21} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Txt bold size={15}>
              {title}
            </Txt>
            {hint ? (
              <Txt size={12} muted>
                {hint}
              </Txt>
            ) : null}
          </View>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={21}
            color={colors.muted}
          />
        </Row>
      </Pressable>
      {open ? <View style={{ paddingTop: 16 }}>{children}</View> : null}
    </View>
  );
}
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { rtl, t, language } = useApp();
  const [focused, setFocused] = useState(false);
  return (
    <Row
      style={{
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: focused ? colors.green : colors.line,
        borderRadius: 18,
        paddingHorizontal: 16,
        marginBottom: 20,
        minHeight: 56,
      }}
    >
      <Icon name="magnify" size={23} color={colors.muted} />
      <TextInput
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={digits(value)}
        onChangeText={(text) => onChangeText(digits(text))}
        style={{
          outlineWidth: 0,
          flex: 1,
          minWidth: 0,
          minHeight: 54,
          fontSize: 13,
          fontFamily: scriptFont(language),
          fontWeight: language === "ps" ? "normal" : undefined,
          color: colors.ink,
          textAlign: rtl ? "right" : "left",
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("clearSearch")}
          hitSlop={10}
          onPress={() => onChangeText("")}
        >
          <Icon name="close-circle" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </Row>
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
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 14,
  },
  button: {
    borderRadius: 16,
    paddingHorizontal: 17,
    minHeight: 44,
    justifyContent: "center",
  },
  input: {
    outlineWidth: 0,
    backgroundColor: "#FAFBF8",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
});
