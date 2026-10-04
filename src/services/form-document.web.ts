import { loadReceiptAttachments } from "../domain/receipt-attachments";
import type { ReceiptContext } from "../domain/receipt-attachments";
import { Asset } from "expo-asset";
import type { Language, Transaction } from "../domain/models";
import { formHtml } from "../domain/print-template";

export async function recordHtml(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  correction?: string,
  context?: ReceiptContext,
) {
  const font = Asset.fromModule(
    language === "ps"
      ? require("../../assets/fonts/BahijBaraem-Regular.ttf")
      : require("../../assets/fonts/NotoSansArabic.ttf"),
  );
  const response = await fetch(font.uri);
  if (!response.ok) throw new Error("imageExportFailed");
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("imageExportFailed"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
  const attachments = context
    ? await loadReceiptAttachments(
        record,
        context,
        async () => ({ photos: {} }),
        async () => undefined,
      )
    : undefined;
  return formHtml(record, language, base64, gregorian, correction, attachments);
}
