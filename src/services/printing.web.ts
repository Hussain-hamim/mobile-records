import type { Language, Transaction } from "../domain/models";
import { formHtml } from "../domain/print-template";
export async function printRecord(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  _share = false,
  correction?: string,
) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow popups to preview the form.");
  popup.document.write(formHtml(record, language, "", gregorian, correction));
  popup.document.close();
  popup.focus();
  popup.print();
}
