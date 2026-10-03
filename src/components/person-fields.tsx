import type { Person } from "../domain/models";
import { useApp } from "../state/app-context";
import { Disclosure, Field } from "./ui";
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
  const renderField = (key: keyof Person) => (
    <Field
      key={key}
      label={t(key) + (key === "name" || key === "idNumber" ? " *" : "")}
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
