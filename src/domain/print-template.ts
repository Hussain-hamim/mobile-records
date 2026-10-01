import type { Language, Person, ShopProfile, Transaction } from "./models";
import { parties } from "./validation";
import { translate, type TextKey } from "../i18n/strings";
import { formatDate } from "./format";
export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function formHtml(
  record: Transaction,
  language: Language,
  fontBase64: string,
  gregorian = false,
  correction?: string,
) {
  const t = (key: TextKey) => escapeHtml(translate(language, key));
  const { buyer, seller } = parties(record);
  const person = (p: Person | ShopProfile) =>
    [
      "name",
      "fatherName",
      "grandfatherName",
      "idNumber",
      "idVolume",
      "idPage",
      "originalAddress",
      "currentAddress",
      "phone",
      "occupation",
      "workplace",
      "relativePhone",
      ...("shopName" in p
        ? ["shopName", "licenceNumber", "shopNumber", "address"]
        : []),
    ]
      .map(
        (k) =>
          `<tr><th>${t(k as TextKey)}</th><td>${escapeHtml(p[k as keyof typeof p]) || "—"}</td></tr>`,
      )
      .join("");
  const phone = Object.entries(record.phone)
    .map(
      ([k, v]) =>
        `<tr><th>${t(k as TextKey)}</th><td dir="auto">${escapeHtml(v) || "—"}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html dir="${language === "en" ? "ltr" : "rtl"}" lang="${language}"><head><meta charset="utf-8"><style>
  @font-face{font-family:Record;src:url(data:font/ttf;base64,${fontBase64}) format('truetype')}@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Record,sans-serif;font-size:9px;color:#111;margin:0}h1{font-size:19px;margin:8px 0}h2{font-size:12px;background:#edf1ee;padding:5px}p{margin:5px 0}.draft{border:2px solid #a15b1f;padding:8px;color:#854814;font-size:12px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #555;padding:4px;vertical-align:top;overflow-wrap:anywhere}th{width:43%;font-weight:500}tr{break-inside:avoid}.cols{display:flex;gap:8px;align-items:flex-start}.col{flex:1;min-width:0}.signatures{display:flex;justify-content:space-between;margin-top:20px}.signatures div{border:1px solid #555;width:30%;height:70px;padding:8px}footer{margin-top:14px;border-top:1px solid #555;padding-top:6px;color:#555}</style></head><body>
  <div class="draft">${t("draftForm")}</div><h1>${escapeHtml(record.shop.shopName)} · ${t(record.direction === "buy" ? "bought" : "sold")}</h1>
  <p dir="ltr">${escapeHtml(record.reference)} · ${escapeHtml(formatDate(record.occurredAt, language, gregorian))} · ${escapeHtml(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kabul", hour: "2-digit", minute: "2-digit" }).format(new Date(record.occurredAt)))}</p>
  ${correction ? `<p>${t("amendments")}: ${escapeHtml(correction)}</p>` : ""}
  <div class="cols"><section class="col"><h2>${t("seller")}</h2><table>${person(seller)}</table></section><section class="col"><h2>${t("phoneDetails")}</h2><table>${phone}<tr><th>${t("price")}</th><td>${escapeHtml(record.price)} AFN</td></tr></table></section><section class="col"><h2>${t("buyer")}</h2><table>${person(buyer)}</table></section></div>
  <p>${t("printHint")}</p><div class="signatures"><div>${t("seller")}</div><div>${t("buyer")}</div><div>${language === "en" ? "Thumbprint" : language === "ps" ? "د ګوتې نښه" : "اثر انگشت"}</div></div>
  <footer>${t("draftForm")} · ${escapeHtml(record.templateVersion)}<br>${language === "en" ? "Declaration text pending a legible source form." : language === "ps" ? "د اعلامیې متن د روښانه اصلي فورمې په تمه دی." : "متن تعهد در انتظار نسخه خوانای فورم اصلی است."}</footer></body></html>`;
}
