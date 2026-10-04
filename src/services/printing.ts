import type { ReceiptContext } from "../domain/receipt-attachments";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import type { Language, Transaction } from "../domain/models";
import { recordHtml } from "./form-document";
export async function printRecord(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  share = false,
  correction?: string,
  context?: ReceiptContext,
) {
  const html = await recordHtml(
    record,
    language,
    gregorian,
    correction,
    context,
  );
  if (!share) {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  try {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: record.reference,
    });
  } finally {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
