import type { ReceiptContext } from "../domain/receipt-attachments";
import type { Language, Transaction } from "../domain/models";
import { recordHtml } from "./form-document";
export async function printRecord(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  _share = false,
  correction?: string,
  context?: ReceiptContext,
) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow popups to preview the form.");
  try {
    popup.document.write(
      await recordHtml(record, language, gregorian, correction, context),
    );
    popup.document.close();
    await popup.document.fonts.load("12px Record");
    await popup.document.fonts.ready;
    await Promise.all(
      Array.from(popup.document.images, (image) => image.decode()),
    );
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error;
  }
}
