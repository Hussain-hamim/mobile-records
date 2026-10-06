import { router } from "expo-router";
import { useApp } from "../state/app-context";
import { PhotoStorageSettings } from "./photo-storage-settings";
import { PhotoFolderSettings } from "./record-photos";
import { Button, Heading, Notice, Screen } from "./ui";

export function PhotosStorageScreen() {
  const { t } = useApp();
  return (
    <Screen>
      <Heading
        title={t("photosStorageTitle")}
        subtitle={t("photosStorageHint")}
        action={
          <Button
            small
            secondary
            label={t("back")}
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)/settings")
            }
          />
        }
      />
      <PhotoStorageSettings />
      <PhotoFolderSettings />
      <Notice message={t("photoRetention")} />
    </Screen>
  );
}
