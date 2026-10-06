import type { Language, Transaction } from "./models";
import type { ReceiptAttachments } from "./receipt-attachments";
import { formHtml } from "./print-template";
import { pashtoFormHtml } from "./print-form-v2";

export function exportLanguage(
  appLanguage: Language,
  originalLayout = false,
): Language {
  return originalLayout ? appLanguage : "ps";
}

export function exportFormHtml(
  record: Transaction,
  language: Language,
  font: string,
  gregorian: boolean,
  correction?: string,
  attachments?: ReceiptAttachments,
  originalLayout = false,
) {
  return originalLayout
    ? formHtml(record, language, font, gregorian, correction, attachments)
    : pashtoFormHtml(record, font, gregorian, correction, attachments);
}
