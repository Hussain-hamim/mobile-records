import { useState } from "react";
import { Image, Modal, ScrollView, View } from "react-native";
import { useApp } from "../state/app-context";
import { Button, Screen, Row } from "./ui";

export function PhotoZoom({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const { t } = useApp();
  const [open, setOpen] = useState(false),
    [zoom, setZoom] = useState(1),
    [area, setArea] = useState({ width: 300, height: 400 });
  const scale = Math.min(area.width / width, area.height / height) * zoom;
  return (
    <>
      <Button
        secondary
        icon="magnify-plus-outline"
        label={t("zoomPhoto")}
        onPress={() => {
          setZoom(1);
          setOpen(true);
        }}
      />
      {open ? (
        <Modal onRequestClose={() => setOpen(false)}>
          <Screen scroll={false}>
            <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <Button
                small
                secondary
                label="−"
                disabled={zoom <= 1}
                onPress={() => setZoom(Math.max(1, zoom - 1))}
              />
              <Button
                small
                secondary
                label="+"
                disabled={zoom >= 4}
                onPress={() => setZoom(Math.min(4, zoom + 1))}
              />
              <Button small label={t("close")} onPress={() => setOpen(false)} />
            </Row>
            <View
              style={{ flex: 1 }}
              onLayout={(e) => setArea(e.nativeEvent.layout)}
            >
              <ScrollView nestedScrollEnabled>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  contentContainerStyle={{
                    minWidth: area.width,
                    minHeight: area.height,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    source={{ uri }}
                    resizeMode="contain"
                    style={{ width: width * scale, height: height * scale }}
                  />
                </ScrollView>
              </ScrollView>
            </View>
          </Screen>
        </Modal>
      ) : null}
    </>
  );
}
