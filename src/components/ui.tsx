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
  Keyboard,
  Platform,
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
import { useSegments } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  hasArabicText,
  inputTypography,
  localScriptFont,
  textRuns,
} from "../domain/text-script";
import { digits } from "../domain/validation";
import type { TextKey } from "../i18n/strings";
import { useApp } from "../state/app-context";
import { colors, motion } from "./theme";
import {
  GradientFill,
  MotionPressable,
  useVisualPreferences,
} from "./visual-effects";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
export { colors } from "./theme";
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
  ...rest
}: {
  children: ReactNode;
  size?: number;
  muted?: boolean;
  bold?: boolean;
  color?: string;
} & Omit<ComponentProps<typeof Text>, "children">) {
  const { rtl, language } = useApp();
  const family = localScriptFont(language);
  const pashto = family === "BahijBaraem";
  const content = Children.toArray(children);
  const local = content.some(
    (child) => typeof child === "string" && hasArabicText(child),
  );
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          lineHeight: size * (rtl ? 1.8 : 1.35),
          color: color ?? (muted ? colors.muted : colors.ink),
          fontWeight: bold ? "700" : "400",
          letterSpacing: bold && !rtl ? -0.4 : 0,
          textAlign: rtl ? "right" : "left",
          writingDirection: local ? "rtl" : "ltr",
        },
        style,
        // The parent always keeps the standard English/system font.
        { fontFamily: undefined },
      ]}
    >
      {Children.map(children, (child) => {
        if (typeof child !== "string" && typeof child !== "number")
          return child;
        return textRuns(String(child)).map((run, index) =>
          run.local ? (
            <Text
              key={index}
              style={{
                fontFamily: family,
                ...(pashto ? { fontWeight: "normal" as const } : {}),
              }}
            >
              {run.text}
            </Text>
          ) : (
            run.text
          ),
        );
      })}
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
  keepBottomVisible = false,
  style,
  ambient = false,
}: {
  ambient?: boolean;
  children: ReactNode;
  scroll?: boolean;
  resetKey?: string | number;
  keepBottomVisible?: boolean;
  style?: ViewStyle;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const bottomPadding = 16 + (segments[0] === "(tabs)" ? 0 : insets.bottom);
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboard(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    if (!keepBottomVisible || keyboard === 0) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [keepBottomVisible, keyboard]);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {ambient ? <GradientFill ambient /> : null}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomPadding },
            style,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            { flex: 1, paddingBottom: bottomPadding },
            style,
          ]}
        >
          {children}
        </View>
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
    <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Txt size={24} bold>
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
  variant,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  variant?: "primary" | "secondary" | "text" | "destructive";
}) {
  const kind = variant ?? (secondary ? "secondary" : "primary");
  const subtle = kind === "secondary" || kind === "text";
  const foreground = subtle ? colors.green : "#fff";
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            kind === "text"
              ? "transparent"
              : kind === "secondary"
                ? colors.mint
                : kind === "destructive"
                  ? colors.red
                  : colors.green,
          paddingVertical: small ? 8 : 10,
          minHeight: small ? 44 : 48,
          overflow: "hidden",
          opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {kind === "primary" ? <GradientFill /> : null}
      <Row style={{ justifyContent: "center", gap: 8 }}>
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : icon ? (
          <Icon name={icon} color={foreground} size={20} />
        ) : null}
        <Txt
          size={small ? 13 : 15}
          bold
          style={{ flexShrink: 1, textAlign: "center" }}
          color={foreground}
        >
          {label}
        </Txt>
      </Row>
    </MotionPressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  numeric = false,
  multiline = false,
  complete = false,
  ...rest
}: TextInputProps & { label: string; numeric?: boolean; complete?: boolean }) {
  const { rtl, language } = useApp();
  const [focused, setFocused] = useState(false);
  const typography = inputTypography(
    numeric || rest.secureTextEntry ? "" : value || rest.placeholder || "",
    language,
  );
  return (
    <View style={{ gap: 4, marginBottom: 12 }}>
      <Txt size={13} bold>
        {label}
      </Txt>
      <View>
        <TextInput
          accessibilityLabel={label}
          value={value == null || rest.secureTextEntry ? value : digits(value)}
          onChangeText={
            onChangeText
              ? (text) =>
                  onChangeText(rest.secureTextEntry ? text : digits(text))
              : undefined
          }
          multiline={multiline}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              ...typography,
              fontWeight:
                typography.fontFamily === "BahijBaraem" ? "normal" : undefined,
              borderColor: complete
                ? colors.success
                : focused
                  ? colors.green
                  : colors.line,
              backgroundColor: focused ? colors.paper : colors.bg,
              textAlign: numeric ? "left" : rtl ? "right" : "left",
              minHeight: multiline ? 80 : 48,
              paddingEnd: complete ? 42 : undefined,
            },
          ]}
          {...rest}
        />
        {complete ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              end: 12,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <Icon name="check-circle" size={22} color={colors.success} />
          </View>
        ) : null}
      </View>
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
        borderRadius: 12,
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
        marginBottom: 12,
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
    <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
      <View
        style={{ padding: 12, borderRadius: 12, backgroundColor: colors.mint }}
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
        borderRadius: 12,
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
    <Row style={{ marginBottom: 12 }}>
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
        <Txt size={16} bold>
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
  forceOpen = false,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  children: ReactNode;
  initiallyOpen?: boolean;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const { reduceMotion } = useVisualPreferences();
  const expanded = open || forceOpen;
  const [visited, setVisited] = useState(initiallyOpen || forceOpen);
  if (expanded && !visited) setVisited(true);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={() => setOpen(!expanded)}
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
            name={expanded ? "chevron-up" : "chevron-down"}
            size={21}
            color={colors.muted}
          />
        </Row>
      </Pressable>
      <Animated.View
        layout={
          reduceMotion
            ? undefined
            : LinearTransition.duration(motion.disclosure)
        }
        style={{ overflow: "hidden" }}
      >
        <View
          style={expanded ? { paddingTop: 8 } : { display: "none" }}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
        >
          {visited ? (
            <Animated.View
              entering={
                reduceMotion ? undefined : FadeIn.duration(motion.disclosure)
              }
            >
              {children}
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
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
  const typography = inputTypography(value || placeholder, language);
  return (
    <Row
      style={{
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: focused ? colors.green : colors.line,
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 12,
        minHeight: 48,
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
          minHeight: 46,
          fontSize: 13,
          ...typography,
          fontWeight:
            typography.fontFamily === "BahijBaraem" ? "normal" : undefined,
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
    return t((message.includes("conflict") ? "conflict" : message) as TextKey);
  } catch {
    return message;
  }
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 16,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  button: {
    borderRadius: 12,
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
