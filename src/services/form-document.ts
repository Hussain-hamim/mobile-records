import { resolvedPhotos } from "./resolved-photos";
import { loadReceiptAttachments } from "../domain/receipt-attachments";
import { loadLocalPhotos } from "./local-photos";
import { receiptPhoto } from "./receipt-photo";
import type { ReceiptContext } from "../domain/receipt-attachments";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { Language, Transaction } from "../domain/models";
import { formHtml } from "../domain/print-template";

export async function recordHtml(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  correction?: string,
  context?: ReceiptContext,
) {
  const font = await Asset.fromModule(
    language === "ps"
      ? require("../../assets/fonts/BahijBaraem-Regular.ttf")
      : require("../../assets/fonts/NotoSansArabic.ttf"),
  ).downloadAsync();
  return formHtml(
    record,
    language,
    await new File(font.localUri!).base64(),
    gregorian,
    correction,
    context
      ? await loadReceiptAttachments(
          record,
          context,
          async (scope) => {
            try {
              return await resolvedPhotos(scope);
            } catch {
              return loadLocalPhotos(scope);
            }
          },
          receiptPhoto,
        )
      : undefined,
  );
}
