import type { ReceiptAttachments } from "./receipt-attachments";
import { receiptImage } from "./receipt-attachments";
import type { TextKey } from "../i18n/strings";

// Versioned attachment supplement. Does not modify the transaction snapshot or
// claim that today's local photos/enrollment were present when it was recorded.
export function printAttachmentsV1(
  attachments: ReceiptAttachments,
  direction: "buy" | "sell",
  t: (key: TextKey) => string,
) {
  const photo = (value: string | undefined, label: TextKey) => {
    const uri = receiptImage(value);
    return `<section class="receipt-photo"><strong>${t(label)}</strong><div class="receipt-image">${uri ? `<img src="${uri}" alt="${t(label)}">` : `<span>${t("receiptPhotoUnavailable")}</span>`}</div></section>`;
  };
  return `<section class="receipt-attachments" data-template="attachments-v1">
    <div class="receipt-attachment-row">
    ${photo(attachments.person, direction === "buy" ? "sellerPhoto" : "buyerPhoto")}
    ${photo(attachments.idFront, "idFrontPhoto")}
    <section class="receipt-fingerprint"><strong>${t("receiptFingerprint")}</strong>
    <div class="receipt-fingerprint-status"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="32" viewBox="0 0 32 36" aria-hidden="true" fill="none" stroke="#555" stroke-width="1.5" stroke-linecap="round"><path d="M3 17C3 0 29 0 29 17M7 20v-3C7 5 25 5 25 17v5M11 24v-7c0-7 10-7 10 0v7M15 29V17M3 22c0 5 2 9 4 11M25 27l-2 7M19 28l-1 6M11 29l1 5"/></svg><span>${t("receiptSymbolOnly")}<br>${t("receiptCurrentStatus")}: ${t(attachments.fingerprintEnrolled === undefined ? "receiptUnknown" : attachments.fingerprintEnrolled ? "fpEnrolled" : "fpNotEnrolled")}</span></div>
    <div class="receipt-thumbprint">${t("receiptPhysicalThumbprint")}</div></section>
    </div><p class="receipt-attachment-note">${t("receiptLocalAttachments")}</p></section>`;
}

export const attachmentStylesV1 = `
body{line-height:1.5}
.signatures{margin-top:12px;break-inside:avoid;page-break-inside:avoid}
.receipt-attachments{margin-top:12px;break-inside:avoid;page-break-inside:avoid}
.receipt-attachment-row{display:flex;gap:8px;align-items:stretch}
.receipt-photo,.receipt-fingerprint{border:1px solid #777;padding:6px;min-width:0;flex:1}
.receipt-photo:nth-child(2){flex:1.5}
.receipt-image{height:116px;display:flex;align-items:center;justify-content:center;text-align:center;margin-top:5px;color:#666}
.receipt-image img{width:100%;height:100%;object-fit:contain}
.receipt-fingerprint-status{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:8px}
.receipt-fingerprint-status svg{flex-shrink:0}
.receipt-thumbprint{height:72px;border:1px dashed #aaa;margin-top:5px;padding:4px;color:#555;font-size:8px}
.receipt-attachment-note{font-size:8px;color:#555}
`;
