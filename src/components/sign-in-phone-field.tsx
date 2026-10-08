import { useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  findPhoneCountries,
  phoneCountries,
  updateSignInPhone,
  type SignInPhone,
} from "../domain/sign-in-phone";
import { useApp } from "../state/app-context";
import { colors, Icon, SearchField, Txt } from "./ui";
import { ModalBackdrop, useVisualPreferences } from "./visual-effects";

export function SignInPhoneField({
  value,
  onChange,
  disabled = false,
}: {
  value: SignInPhone;
  onChange: (value: SignInPhone) => void;
  disabled?: boolean;
}) {
  const { t, language } = useApp();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useVisualPreferences();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const countries = useMemo(
    () => findPhoneCountries(query, language),
    [query, language],
  );
  const selected = phoneCountries.find(
    (country) => country.code === value.country,
  )!;
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={styles.field}>
      <Txt size={13} bold>
        {t("phone")}
      </Txt>
      {/* Explicit LTR keeps the country selector on the physical left in every language. */}
      <View
        {...(Platform.OS === "web" ? { dir: "ltr" } : {})}
        style={[styles.inputRow, focused && { borderColor: colors.green }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("choosePhoneCountry")}: ${selected[language]} ${selected.dialCode}`}
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
          style={styles.countryButton}
        >
          <Txt size={20}>{selected.flag}</Txt>
          <Txt size={15} bold>
            {selected.dialCode}
          </Txt>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <TextInput
          accessibilityLabel={t("phone")}
          editable={!disabled}
          value={value.number}
          onChangeText={(text) => onChange(updateSignInPhone(text, value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="phone-pad"
          autoComplete="tel-national"
          autoCorrect={false}
          placeholder={
            value.country === "AF" ? "700 123 456" : t("nationalPhone")
          }
          placeholderTextColor={colors.muted}
          style={styles.number}
        />
      </View>
      {open ? (
        <Modal
          transparent
          visible
          animationType={reduceMotion ? "none" : "fade"}
          onRequestClose={close}
        >
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ModalBackdrop />
            <View
              style={[
                styles.sheet,
                {
                  marginTop: insets.top + 16,
                  marginBottom: insets.bottom + 16,
                },
              ]}
              accessibilityViewIsModal
            >
              <View style={styles.header}>
                <Txt size={18} bold style={{ flex: 1 }}>
                  {t("choosePhoneCountry")}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("close")}
                  onPress={close}
                  style={styles.close}
                >
                  <Icon name="close" />
                </Pressable>
              </View>
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder={t("searchPhoneCountry")}
              />
              <FlatList
                data={countries}
                keyExtractor={(country) => country.code}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={14}
                extraData={value.country}
                ListEmptyComponent={
                  <Txt muted style={{ padding: 16 }}>
                    {t("noPhoneCountries")}
                  </Txt>
                }
                renderItem={({ item }) => (
                  <Pressable
                    {...(Platform.OS === "web" ? { dir: "ltr" } : {})}
                    accessibilityRole="button"
                    accessibilityLabel={`${item[language]} ${item.dialCode}`}
                    accessibilityState={{
                      selected: item.code === value.country,
                    }}
                    style={[
                      styles.countryRow,
                      item.code === value.country && {
                        backgroundColor: colors.mint,
                      },
                    ]}
                    onPress={() => {
                      onChange({ ...value, country: item.code });
                      close();
                    }}
                  >
                    <Txt size={24}>{item.flag}</Txt>
                    <Txt style={{ flex: 1 }}>{item[language]}</Txt>
                    <Txt muted>{item.dialCode}</Txt>
                    {item.code === value.country ? (
                      <Icon name="check" size={20} color={colors.green} />
                    ) : null}
                  </Pressable>
                )}
              />
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4, marginBottom: 12 },
  inputRow: {
    flexDirection: "row",
    ...(Platform.OS === "web" ? {} : { direction: "ltr" as const }),
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.bg,
    minHeight: 48,
  },
  countryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    minHeight: 48,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  number: {
    outlineWidth: 0,
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    textAlign: "left",
    writingDirection: "ltr",
  },
  overlay: { flex: 1, paddingHorizontal: 16, justifyContent: "center" },
  sheet: {
    flex: 1,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 12,
    backgroundColor: colors.paper,
    borderRadius: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  countryRow: {
    flexDirection: "row",
    ...(Platform.OS === "web" ? {} : { direction: "ltr" as const }),
    alignItems: "center",
    gap: 12,
    padding: 12,
    minHeight: 52,
    borderRadius: 10,
  },
});
