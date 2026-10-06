import type { Transaction } from "./models";
import type { ReceiptAttachments } from "./receipt-attachments";
import { receiptImage } from "./receipt-attachments";
import { escapeHtml } from "./print-template";
function formDate(date: string, gregorian: boolean) {
  // Some Android/browser ICU builds lack Pashto month names. Localize them here
  // while Intl still performs calendar conversion and Kabul timezone handling.
  const months = gregorian
    ? [
        "جنوري",
        "فبروري",
        "مارچ",
        "اپرېل",
        "مې",
        "جون",
        "جولای",
        "اګست",
        "سپتمبر",
        "اکتوبر",
        "نومبر",
        "دسمبر",
      ]
    : [
        "وری",
        "غویی",
        "غبرګولی",
        "چنګاښ",
        "زمری",
        "وږی",
        "تله",
        "لړم",
        "لیندۍ",
        "مرغومی",
        "سلواغه",
        "کب",
      ];
  const parts = new Intl.DateTimeFormat("en-GB", {
    calendar: gregorian ? "gregory" : "persian",
    numberingSystem: "latn",
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(date));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")} ${months[Number(part("month")) - 1]} ${part("year")} · ${gregorian ? "میلادي" : "هجري لمریز"}`;
}

// Presentation version only: never rewrites a saved transaction snapshot.
export const FORM_LAYOUT_V2 = "pashto-v2";

export function pashtoFormHtml(
  record: Transaction,
  fontBase64: string,
  gregorian = false,
  correction?: string,
  attachments: ReceiptAttachments = {},
) {
  const e = escapeHtml;
  const value = (v: unknown, ltr = false) =>
    `<span dir="${ltr ? "ltr" : "auto"}">${e(v) || "—"}</span>`;
  const row = (label: string, v: unknown, ltr = false) =>
    `<tr><th>${label}</th><td>${value(v, ltr)}</td></tr>`;
  const customerRole = record.direction === "buy" ? "پلورونکي" : "پېرودونکي";
  const shopRole = record.direction === "buy" ? "پېرودونکي" : "پلورونکي";
  const p = record.customer,
    s = record.shop,
    phone = record.phone;
  const cell = (label: string, v: unknown, ltr = false) =>
    `<td><div class="label">${label}</div><div class="value">${value(v, ltr)}</div></td>`;
  const photo = (uri: string | undefined, title: string, kind: string) => {
    const image = receiptImage(uri);
    return `<div class="photo ${kind}"><div class="label">${title}</div><div class="image">${image ? `<img src="${image}" alt="${title}">` : '<span class="missing">عکس نشته</span>'}</div></div>`;
  };
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kabul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(record.occurredAt));
  return `<!doctype html><html lang="ps" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(record.reference)}</title><style>
@font-face{font-family:Record;src:url(data:font/ttf;base64,${fontBase64}) format('truetype');font-weight:100 900}
@page{size:A4;margin:10mm}*{box-sizing:border-box}html{background:#fff}body{font-family:Record,sans-serif;color:#192c2a;font-size:10px;line-height:1.4;margin:0;background:#fff;overflow-wrap:anywhere}h1,h2,p{margin:0}h1{font-size:23px;line-height:1.5}h2{font-size:12px;font-weight:600}b,strong{font-weight:600}.header{border-bottom:3px solid #245c50;padding-bottom:9px;display:flex;justify-content:space-between;gap:16px;align-items:center}.eyebrow,.label{color:#516b64;font-size:9px}.shop-name{font-size:13px}.reference{text-align:left;min-width:150px;font-family:Record,sans-serif}.reference strong{font-family:Arial,sans-serif;font-size:12px}.meta{display:flex;justify-content:space-between;gap:12px;background:#f1f6f3;padding:8px 10px;margin:9px 0 12px;border-radius:5px}.notice{border:1px solid #ad7448;padding:6px;margin:8px 0}.parties{display:flex;gap:12px;align-items:flex-start}.party{flex:1;min-width:0}.section-title{padding:5px 8px;background:#edf3f0;border-right:3px solid #245c50;margin-bottom:5px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{vertical-align:top;text-align:right;overflow-wrap:anywhere}th{font-size:9px;color:#516b64;font-weight:400;width:35%}.identity th,.identity td{padding:2px 6px;border-bottom:1px solid #e1e7e3}.identity tr{break-inside:avoid;page-break-inside:avoid}section{margin-bottom:8px}.specs{border:1px solid #d7e2db}.specs td{padding:4px 8px;border:1px solid #d7e2db}.value{font-size:11px;color:#192c2a}.imei .value{font-family:Arial,sans-serif;letter-spacing:1px;font-size:12px}.price{display:flex;justify-content:space-between;align-items:center;border:1px solid #c8d9ce;background:#f1f6f3;padding:7px 10px;margin-top:7px}.price strong{font-size:17px}.photos{display:flex;gap:10px;break-inside:avoid;page-break-inside:avoid}.photo{border:1px solid #d7e2db;border-radius:5px;padding:7px;min-width:0}.portrait{flex:1}.id-card{flex:2.2}.image{height:38mm;display:flex;align-items:center;justify-content:center;margin-top:5px;background:#fafcfb}.image img{width:100%;height:100%;object-fit:contain}.missing{color:#6f7d75;font-size:10px}.biometric{width:32mm;flex-shrink:0;text-align:center;border:1px solid #c8d9ce;border-radius:5px;padding:9px 6px;background:#f5f9f6}.biometric svg{display:block;width:30px;height:36px;margin:12px auto 8px}.biometric b,.biometric .tiny{display:block;margin-top:6px}span[dir=ltr]{display:inline-block;unicode-bidi:isolate}.tiny{font-size:8px;color:#65776e}.declaration{border:1px solid #d7e2db;border-radius:5px;padding:8px 10px;margin-top:10px;break-inside:avoid;page-break-inside:avoid}.declaration p{margin-top:4px}.signatures{display:flex;gap:12px;margin-top:12px;break-inside:avoid;page-break-inside:avoid}.signature{flex:1;border:1px solid #b7c9bf;border-radius:4px;padding:7px;height:20mm}.signature .line{border-bottom:1px dotted #8b9f93;margin-top:10mm}footer{border-top:1px solid #c8d9ce;margin-top:12px;padding-top:5px;display:flex;justify-content:space-between;gap:14px;font-size:8px;color:#65776e}h2{break-after:avoid;page-break-after:avoid}.specs tr,.meta,.header{break-inside:avoid;page-break-inside:avoid}
@media screen{body{max-width:794px;margin:auto;padding:38px}}
</style></head><body data-template="${FORM_LAYOUT_V2}">
<header class="header"><div><div class="eyebrow">د موبایل د معاملې ثبت</div><h1>د موبایل د پېر او پلور سند</h1><div class="shop-name">${e(s.shopName)}</div></div><div class="reference"><div class="label">د ثبت شمېره</div><strong dir="ltr">${e(record.reference)}</strong></div></header>
<div class="meta"><span><b>معامله:</b> ${record.direction === "buy" ? "د دوکان له خوا پېرود" : "د دوکان له خوا پلور"}</span><span><b>نېټه:</b> ${e(formDate(record.occurredAt, gregorian))}</span><span><b>وخت:</b> <span dir="ltr">${e(time)}</span> · کابل</span></div>
${correction ? `<div class="notice"><b>د ثبت یادونه:</b> ${e(correction)}</div>` : ""}
<section class="parties"><div class="party"><h2 class="section-title">د ${customerRole} پېژندنه · مشتری</h2><table class="identity">
${row("نوم", p.name)}${row("د پلار نوم", p.fatherName)}${row("د نیکه نوم", p.grandfatherName)}
${row("د تذکرې ډول", p.idType === "pnid" ? "کاغذي تذکره (PNID)" : p.idType === "enid" ? "برېښنايي تذکره (ENID)" : "")}
${row("د تذکرې شمېره", p.idNumber, true)}${p.idVolume || p.idPage ? row("جلد / پاڼه", [p.idVolume, p.idPage].filter(Boolean).join(" / "), true) : ""}
${row("اصلي استوګنځی", p.originalAddress)}${row("اوسنی استوګنځی", p.currentAddress)}${row("د اړیکې شمېره", p.phone, true)}${row("دنده او د کار ځای", [p.occupation, p.workplace].filter(Boolean).join(" · "))}${row("د خپلوانو شمېره", p.relativePhone, true)}
</table></div><div class="party"><h2 class="section-title">د ${shopRole} پېژندنه · دوکاندار</h2><table class="identity">
${row("د دوکاندار نوم", s.name)}${row("د پلار نوم", s.fatherName)}${row("د دوکان نوم", s.shopName)}${row("د جواز شمېره", s.licenceNumber, true)}${row("د دوکان شمېره", s.shopNumber, true)}${row("اصلي استوګنځی", s.originalAddress)}${row("اوسنی استوګنځی", s.currentAddress)}${row("د اړیکې شمېره", s.phone, true)}${row("د دوکان دقیق ادرس", s.address)}
</table></div></section>
<section><h2 class="section-title">د موبایل بشپړ مشخصات</h2><table class="specs"><tbody><tr>${cell("برانډ", phone.brand)}${cell("ماډل", phone.model)}${cell("رنګ", phone.color)}${cell("د سیمکارتونو شمېر", phone.simCount)}</tr><tr>${cell("حافظه", phone.storage, /[a-z]/i.test(phone.storage))}${cell("ریم", phone.ram, /[a-z]/i.test(phone.ram))}<td colspan="2"><div class="label">د موبایل حالت</div><div class="value">${value(phone.condition)}</div></td></tr></tbody></table><table class="specs imei"><tr>${cell("د IMEI لومړۍ شمېره", phone.imei1, true)}${phone.imei2 ? cell("د IMEI دویمه شمېره", phone.imei2, true) : ""}</tr></table>
${phone.notes ? `<table class="identity"><tr><th>نور مشخصات او یادونې</th><td>${value(phone.notes)}</td></tr></table>` : ""}<div class="price"><span>د موبایل بیه</span><strong><span dir="ltr">${e(record.price)}</span> افغانۍ</strong></div></section>
<section><h2 class="section-title">د ${customerRole} عکسونه او اسناد</h2><div class="photos">
${photo(attachments.person, `د ${customerRole} عکس`, "portrait")}${photo(attachments.idFront, "د تذکرې عکس", "id-card")}
${attachments.fingerprintEnrolled === true ? `<div class="biometric" data-biometric="enrolled"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" aria-hidden="true" fill="none" stroke="#245c50" stroke-width="1.5" stroke-linecap="round"><path d="M3 17C3 0 29 0 29 17M7 20v-3C7 5 25 5 25 17v5M11 24v-7c0-7 10-7 10 0v7M15 29V17M3 22c0 5 2 9 4 11M25 27l-2 7M19 28l-1 6M11 29l1 5"/></svg><b>بایومټریک ثبت شوی</b><span class="tiny">د چاپ پر وخت حالت<br>دا سمبول دی، اصلي ګوته نه ده</span></div>` : ""}</div><p class="tiny">${attachments.fingerprintEnrolled === true ? "عکسونه او د بایومټریک حالت د چاپ پر وخت موجود معلومات ښيي." : "عکسونه د چاپ پر وخت موجود اسناد ښيي."}</p></section>
<section class="declaration"><h2>د پلورونکي اقرار</h2><p>زه، د پورته مشخصاتو لرونکي موبایل پلورونکی، اقرار کوم چې یاد موبایل زما ملکیت دی. که د اړوندو ادارو له خوا دا موبایل په غلا، اختطاف، قتل یا بل جرم کې ثابت شي، مسؤولیت یې زما پر غاړه دی. پېرودونکی او پلورونکی د پورته معلوماتو او بیې په تایید دا سند لاسلیک کوي.</p></section>
<section class="signatures"><div class="signature"><b>د پلورونکي لاسلیک / د ګوتې نښه</b><div class="line"></div></div><div class="signature"><b>د پېرودونکي لاسلیک / د ګوتې نښه</b><div class="line"></div></div></section>
<footer><span>${e(s.shopName)} · <span dir="ltr">${e(s.phone)}</span></span><span dir="ltr">${e(record.reference)} · ${FORM_LAYOUT_V2}</span></footer>
</body></html>`;
}
