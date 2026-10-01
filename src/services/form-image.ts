import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Crypto from "expo-crypto";
import { requireOptionalNativeModule } from "expo-modules-core";
import type { Language, Transaction } from "../domain/models";
import type { FormPicture } from "./form-image-types";
import { recordHtml } from "./form-document";

const native = requireOptionalNativeModule<{
  renderPdf(uri: string, directory: string): Promise<string[]>;
}>("RecordExport");

export async function saveFormImage(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  correction?: string,
  _onPreview?: (picture: FormPicture) => void,
): Promise<"imageReady" | "imageSaved" | null> {
  if (!native) throw new Error("imageNativeRequired");
  let destination: Directory;
  try {
    destination = await Directory.pickDirectoryAsync();
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_PICKER_CANCELLED")
      return null;
    throw error;
  }
  const folder = new Directory(
    Paths.cache,
    "form-exports",
    Crypto.randomUUID(),
  );
  folder.create({ intermediates: true });
  let pdf: File | undefined;
  const created: File[] = [];
  try {
    const html = await recordHtml(record, language, gregorian, correction);
    const { uri } = await Print.printToFileAsync({ html });
    pdf = new File(uri);
    const privatePdf = new File(folder, "form.pdf");
    await pdf.move(privatePdf);
    pdf = privatePdf;
    const pages = await native.renderPdf(pdf.uri, folder.uri);
    for (const [index, page] of pages.entries()) {
      const suffix = pages.length > 1 ? `-page-${index + 1}` : "";
      const target = destination.createFile(
        `${record.reference}${correction ? "-correction" : ""}${suffix}.png`,
        "image/png",
      );
      created.push(target);
      target.write(await new File(page).bytes());
    }
    return "imageSaved";
  } catch (error) {
    // Remove only files created by this failed export, never earlier exports.
    for (const file of created) {
      try {
        file.delete();
      } catch {}
    }
    throw error;
  } finally {
    if (pdf?.exists) pdf.delete();
    if (folder.exists) folder.delete();
  }
}
