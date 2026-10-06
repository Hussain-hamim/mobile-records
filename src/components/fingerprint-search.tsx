import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useApp } from "../state/app-context";
import { scanTemplates } from "../domain/fingerprints";
import { Button } from "./ui";
import { FingerprintPrompt } from "./fingerprint-prompt";
export function FingerprintSearch({
  onIdentified,
  onManual,
  onNew,
  returning = false,
}: {
  onIdentified?: (id: string) => void;
  onManual?: () => void;
  onNew?: () => void;
  returning?: boolean;
}) {
  const { customers, t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 8 }}>
      <Button
        small
        secondary
        label={t(returning ? "fpReturning" : "fpFind")}
        icon="fingerprint"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <FingerprintPrompt
          mode="identify"
          templates={scanTemplates(customers)}
          onClose={() => setOpen(false)}
          onManual={onManual}
          onNew={onNew}
          onIdentified={(id) => {
            setOpen(false);
            if (onIdentified) onIdentified(id);
            else router.push({ pathname: "/customer/[id]", params: { id } });
          }}
        />
      ) : null}
    </View>
  );
}
