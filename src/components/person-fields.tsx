import type { Person } from "../domain/models";
import { useApp } from "../state/app-context";
import { Field } from "./ui";
export const personKeys: (keyof Person)[] = [
  "name",
  "fatherName",
  "grandfatherName",
  "idNumber",
  "idVolume",
  "idPage",
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
}: {
  value: Person;
  onChange: (p: Person) => void;
}) {
  const { t } = useApp();
  return (
    <>
      {personKeys.map((key) => (
        <Field
          key={key}
          label={t(key) + (key === "name" || key === "idNumber" ? " *" : "")}
          value={value[key]}
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
      ))}
    </>
  );
}
