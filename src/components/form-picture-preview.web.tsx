import { useEffect } from "react";
import { Modal, ScrollView, View } from "react-native";
import type { FormPicture } from "../services/form-image-types";
import { useApp } from "../state/app-context";
import { Button, Row, Txt, colors } from "./ui";

export function FormPicturePreview({
  picture,
  onClose,
}: {
  picture: FormPicture | null;
  onClose: () => void;
}) {
  const { t, language } = useApp();
  useEffect(() => {
    if (!picture) return;
    return () => URL.revokeObjectURL(picture.uri);
  }, [picture]);
  return (
    <Modal
      visible={!!picture}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#20233DAA",
          padding: 16,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            maxWidth: 860,
            width: "100%",
            maxHeight: "95%",
            alignSelf: "center",
            backgroundColor: colors.bg,
            borderRadius: 22,
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 16 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={18}>
                {t("savePicture")}
              </Txt>
              <Button label={t("close")} secondary small onPress={onClose} />
            </Row>
            {picture ? (
              <a
                href={picture.uri}
                download={picture.filename}
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 14,
                  background: colors.green,
                  color: "white",
                  textDecoration: "none",
                  fontFamily:
                    language === "ps"
                      ? "BahijBaraem, sans-serif"
                      : "Noto, sans-serif",
                  fontSize: 14,
                }}
              >
                {t("downloadPng")}
              </a>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
            {picture ? (
              <img
                src={picture.uri}
                alt={t("savePicture")}
                width={picture.width}
                height={picture.height}
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  backgroundColor: "white",
                }}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
