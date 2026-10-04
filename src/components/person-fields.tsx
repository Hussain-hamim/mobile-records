import type { Person } from "../domain/models";
import { useApp } from "../state/app-context";
import { View } from "react-native";
import { formatTazkiraNumber } from "../domain/validation";
import { Disclosure, Field, Row, Chip, Txt } from "./ui";
export const personKeys: (keyof Person)[] = [
  "name",
  "fatherName",
  "grandfatherName",
  "idNumber",
  "idVolume",
  "idPage",
  "dateOfBirth",
  "gender",
  "nationality",
  "originalAddress",
  "currentAddress",
  "phone",
  "occupation",
  "workplace",
  "relativePhone",
];
export function PersonFields({
  value,
  onChange,
  compact = true,
}: {
  compact?: boolean;
  value: Person;
  onChange: (p: Person) => void;
}) {
  const { t } = useApp();
  const idType = value.idType ?? "enid";
  const renderField = (key: keyof Person) =>
    key === "idNumber" ? (
      <View key={key}>
        <Row style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <Txt size={12} muted>
            {t("idType")}
          </Txt>
          {(["enid", "pnid"] as const).map((type) => (
            <Chip
              key={type}
              label={t(type)}
              active={idType === type}
              onPress={() =>
                onChange({
                  ...value,
                  idType: type,
                  idNumber: formatTazkiraNumber(value.idNumber, type),
                })
              }
            />
          ))}
        </Row>
        <Field
          label={t(idType === "enid" ? "enidNumber" : "pnidNumber") + " *"}
          value={value.idNumber}
          numeric
          keyboardType="number-pad"
          placeholder={idType === "enid" ? "1234-1234-12345" : undefined}
          onChangeText={(text) =>
            onChange({
              ...value,
              idType,
              idNumber: formatTazkiraNumber(text, idType),
            })
          }
        />
      </View>
    ) : (
      <Field
        key={key}
        label={t(key) + (key === "name" ? " *" : "")}
        value={value[key] ?? ""}
        onChangeText={(text) => onChange({ ...value, [key]: text })}
        numeric={[
          "phone",
          "relativePhone",
          "idNumber",
          "idVolume",
          "idPage",
        ].includes(key)}
        multiline={key === "originalAddress" || key === "currentAddress"}
      />
    );
  if (!compact) return <>{personKeys.map(renderField)}</>;
  return (
    <>
      {(["name", "idNumber", "phone"] as const).map(renderField)}
      <Disclosure
        title={t("moreDetails")}
        hint={t("personExtra")}
        icon="account-details-outline"
      >
        {personKeys
          .filter((key) => !["name", "idNumber", "phone"].includes(key))
          .map(renderField)}
      </Disclosure>
    </>
  );
}
