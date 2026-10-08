import { View } from "react-native";
import { useApp } from "../state/app-context";
import { Button, Notice, Txt, errorText } from "./ui";
export function PageFeedback({
  loading,
  error,
  hasMore = false,
  onMore,
  onRetry,
}: {
  loading: boolean;
  error: string;
  hasMore?: boolean;
  onMore?: () => void;
  onRetry: () => void;
}) {
  const { t } = useApp();
  return (
    <View style={{ paddingVertical: 12 }}>
      {loading ? <Txt muted>{t("loading")}</Txt> : null}
      {error ? (
        <>
          <Notice message={errorText(new Error(error), t)} tone="error" />
          <Button small secondary label={t("retryLoad")} onPress={onRetry} />
        </>
      ) : null}
      {!loading && !error && hasMore && onMore ? (
        <Button small secondary label={t("loadMore")} onPress={onMore} />
      ) : null}
    </View>
  );
}
