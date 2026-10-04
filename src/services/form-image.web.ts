import type { ReceiptContext } from "../domain/receipt-attachments";
import { toBlob } from "html-to-image";
import type { Language, Transaction } from "../domain/models";
import type { FormPicture } from "./form-image-types";
import { recordHtml } from "./form-document";

export async function saveFormImage(
  record: Transaction,
  language: Language,
  gregorian: boolean,
  correction?: string,
  onPreview?: (picture: FormPicture) => void,
  context?: ReceiptContext,
): Promise<"imageReady" | "imageSaved" | null> {
  const html = await recordHtml(
    record,
    language,
    gregorian,
    correction,
    context,
  );
  const source = new DOMParser().parseFromString(html, "text/html");
  const frame = document.createElement("iframe");
  frame.title = "Form image export";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none";
  // Same-origin, local document. No scripts or external content from the record.
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    doc.body.style.cssText =
      "width:794px;min-height:1123px;padding:45px;background:#fff";
    await doc.fonts.load("12px Record");
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images, (image) => image.decode()));
    const height = Math.max(1123, doc.body.scrollHeight);
    // Avoid an oversized canvas silently clipping a very long form.
    if (height > 16000) throw new Error("imageTooLarge");
    const blob = await toBlob(doc.body, {
      width: 794,
      height,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      fontEmbedCSS: source.querySelector("style")!.textContent!,
      skipAutoScale: false,
    });
    if (!blob) throw new Error("imageExportFailed");
    const url = URL.createObjectURL(blob);
    const filename = `${record.reference}${correction ? "-correction" : ""}.png`;
    if (onPreview) {
      onPreview({ uri: url, width: 1588, height: height * 2, filename });
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return "imageReady";
  } finally {
    frame.remove();
  }
}
