import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { Language, Transaction } from "../domain/models";
import { formHtml } from "../domain/print-template";
export async function printRecord(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  share = false,
  correction?: string,
) {
  const font = await Asset.fromModule(
    require("../../assets/fonts/NotoSansArabic.ttf"),
  ).downloadAsync();
  const html = formHtml(
    record,
    language,
    await new File(font.localUri!).base64(),
    gregorian,
    correction,
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
