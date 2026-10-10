import type { Language } from "../../domain/models";
const strings = {
  disabled: ["Not participating", "ګډون نه کوي", "عضو نیست"],
  newPost: [
    "Share with shops",
    "له دوکانونو سره شریک کړئ",
    "اشتراک با دکان‌ها",
  ],
  to: ["To", "ته", "به"],
  expires: ["Expires", "پای ته رسېږي", "انقضا"],
  sent: [
    "Saved successfully.",
    "په بریالیتوب ثبت شول.",
    "با موفقیت ذخیره شد.",
  ],
  title: ["Shop network", "د دوکانونو شبکه", "شبکه دکان‌ها"],
  intro: [
    "Connect with approved shops. Share only the business details you choose.",
    "له منل شویو دوکانونو سره اړیکه ونیسئ. یوازې غوره شوي سوداګریز معلومات شریک کړئ.",
    "با دکان‌های تأییدشده وصل شوید. فقط اطلاعات تجاری انتخاب‌شده را شریک کنید.",
  ],
  privacy: [
    "Customer identities, photos, fingerprints and records stay private.",
    "د پېرودونکو هویت، انځورونه، ګوتې او ریکارډونه شخصي پاتې کېږي.",
    "هویت، عکس، اثر انگشت و سوابق مشتریان خصوصی می‌ماند.",
  ],
  directory: ["Directory", "دوکانونه", "فهرست دکان‌ها"],
  connections: ["Connections", "اړیکې", "ارتباطات"],
  board: ["Phone board", "د موبایلونو اعلانونه", "تابلوی موبایل‌ها"],
  settings: ["Network settings", "د شبکې تنظیمات", "تنظیمات شبکه"],
  audit: ["Sharing activity", "د شریکولو فعالیت", "فعالیت اشتراک‌گذاری"],
  approved: [
    "Platform approved",
    "د پلاتفورم له خوا منل شوی",
    "تأییدشده توسط پلتفرم",
  ],
  approvalHint: [
    "Approval confirms platform review, not a guarantee of any deal.",
    "منل کېدل د پلاتفورم کتنه ښيي، د معاملې ضمانت نه دی.",
    "تأیید، بررسی پلتفرم است و تضمین معامله نیست.",
  ],
  pending: ["Pending", "په تمه", "در انتظار"],
  suspended: ["Suspended", "ځنډول شوی", "تعلیق‌شده"],
  accepted: ["Confirmed", "تایید شوی", "تأیید شده"],
  declined: ["Declined", "رد شوی", "رد شده"],
  cancelled: ["Cancelled", "لغوه شوی", "لغو شده"],
  expired: ["Expired", "پای ته رسېدلی", "منقضی"],
  connect: ["Request connection", "د اړیکې غوښتنه", "درخواست ارتباط"],
  accept: ["Accept request", "غوښتنه ومنئ", "پذیرش درخواست"],
  disconnect: [
    "Disconnect / decline",
    "اړیکه پرې کړئ / رد کړئ",
    "قطع ارتباط / رد",
  ],
  block: ["Block shop", "دوکان بند کړئ", "مسدود کردن دکان"],
  unblock: ["Unblock", "بندیز لرې کړئ", "رفع مسدودی"],
  report: ["Report to admin", "مدیر ته راپور", "گزارش به مدیر"],
  reason: [
    "Reason (no customer details)",
    "دلیل (د پېرودونکي معلومات مه لیکئ)",
    "دلیل (بدون اطلاعات مشتری)",
  ],
  offer: ["Phone offer", "د موبایل وړاندیز", "پیشنهاد موبایل"],
  request: ["Phone request", "د موبایل غوښتنه", "درخواست موبایل"],
  recipients: [
    "Choose connected shops",
    "تړلي دوکانونه غوره کړئ",
    "انتخاب دکان‌های متصل",
  ],
  preview: ["Preview sharing", "د شریکولو مخکتنه", "پیش‌نمایش اشتراک"],
  send: ["Confirm and send", "تایید او ولېږئ", "تأیید و ارسال"],
  back: ["Back", "شاته", "برگشت"],
  close: ["Close", "بند کړئ", "بستن"],
  closePost: ["Close listing", "اعلان بند کړئ", "بستن آگهی"],
  refresh: ["Refresh", "تازه کړئ", "تازه‌سازی"],
  more: ["Load more", "نور وښایئ", "نمایش بیشتر"],
  search: [
    "Search shop, area or phone model",
    "دوکان، سیمه یا ماډل ولټوئ",
    "جستجوی دکان، منطقه یا مدل",
  ],
  empty: ["Nothing here yet.", "تر اوسه څه نشته.", "هنوز موردی نیست."],
  name: ["Public shop name", "د دوکان ښکاره نوم", "نام عمومی دکان"],
  area: ["Area", "سیمه", "منطقه"],
  contact: [
    "Business contact (optional)",
    "سوداګریزه اړیکه (اختیاري)",
    "تماس تجاری (اختیاری)",
  ],
  enable: ["Participate in network", "په شبکه کې ګډون", "عضویت در شبکه"],
  submit: ["Submit for review", "د کتنې لپاره ولېږئ", "ارسال برای بررسی"],
  profileHint: [
    "Only these fields are published after approval. Changing them requires another review.",
    "یوازې دا معلومات له تایید وروسته ښکاره کېږي. بدلون بیا کتنې ته اړتیا لري.",
    "فقط این اطلاعات پس از تأیید منتشر می‌شود. تغییرات نیاز به بررسی دوباره دارد.",
  ],
  staff: [
    "Staff sharing access",
    "د کارکوونکو د شریکولو اجازه",
    "اجازه اشتراک برای کارکنان",
  ],
  grant: ["Allow sharing", "د شریکولو اجازه", "اجازه اشتراک"],
  revoke: [
    "Remove sharing access",
    "د شریکولو اجازه لرې کړئ",
    "لغو اجازه اشتراک",
  ],
  postHint: [
    "Only the device fields shown here go to the selected shops. Listings expire after seven days. Never enter customer information.",
    "یوازې دلته ښودل شوي معلومات ټاکلو دوکانونو ته ځي. اعلانونه اووه ورځې وروسته ختمېږي. د پېرودونکي معلومات مه لیکئ.",
    "فقط مشخصات نمایش‌داده‌شده به دکان‌های انتخاب‌شده می‌رود. آگهی‌ها بعد از هفت روز منقضی می‌شوند. اطلاعات مشتری وارد نکنید.",
  ],
  confirmAction: [
    "Confirm this action?",
    "دا کار تاییدوئ؟",
    "این اقدام را تأیید می‌کنید؟",
  ],
  disconnectHint: [
    "This ends access to shared listings between your shops.",
    "دا ستاسو د دوکانونو ترمنځ شریکو اعلانونو ته لاسرسی بندوي.",
    "دسترسی به آگهی‌های مشترک بین دکان‌ها قطع می‌شود.",
  ],
  readOnly: [
    "Your owner manages participation and sharing permissions.",
    "ستاسو مالک ګډون او د شریکولو اجازه اداره کوي.",
    "مالک شما عضویت و اجازه اشتراک را مدیریت می‌کند.",
  ],
  demo: [
    "Demo network — simulated shops and replies; nothing is published.",
    "نمونوي شبکه — دوکانونه او ځوابونه فرضي دي؛ څه نه خپرېږي.",
    "شبکه نمایشی — دکان‌ها و پاسخ‌ها فرضی‌اند؛ چیزی منتشر نمی‌شود.",
  ],
  networkApproval: [
    "Your owner must enable the network and receive platform approval first.",
    "مالک باید لومړی شبکه فعاله او د پلاتفورم تایید ترلاسه کړي.",
    "مالک باید ابتدا شبکه را فعال کند و تأیید پلتفرم بگیرد.",
  ],
  networkInvalid: [
    "Check the required fields and selected recipients.",
    "اړین معلومات او ترلاسه کوونکي وګورئ.",
    "فیلدهای ضروری و گیرندگان را بررسی کنید.",
  ],
  networkPrivate: [
    "Full IMEIs cannot appear in listings. Share the brand and model only.",
    "بشپړ IMEI په اعلان کې نه شي راتلای. یوازې برانډ او ماډل شریک کړئ.",
    "IMEI کامل در آگهی مجاز نیست. فقط برند و مدل را شریک کنید.",
  ],
  networkUnavailable: [
    "Could not complete this request. Refresh and check the connection or shop status.",
    "غوښتنه بشپړه نه شوه. تازه کړئ او اړیکه یا د دوکان حالت وګورئ.",
    "درخواست انجام نشد. تازه‌سازی کنید و اتصال یا وضعیت دکان را بررسی کنید.",
  ],
  networkRate: [
    "Too many requests. Please try again later.",
    "غوښتنې ډېرې دي. وروسته بیا هڅه وکړئ.",
    "درخواست‌ها زیاد است. بعداً تلاش کنید.",
  ],
  noAccess: [
    "You no longer have permission for this action.",
    "تاسو د دې کار اجازه نه لرئ.",
    "دیگر اجازه این اقدام را ندارید.",
  ],
  versionConflict: [
    "This changed since you opened it. Refresh and review again.",
    "دا له پرانیستلو وروسته بدل شوي. تازه او بیا یې وګورئ.",
    "این مورد تغییر کرده است. تازه‌سازی و دوباره بررسی کنید.",
  ],
} as const;
export type NetworkText = keyof typeof strings;
export function networkText(language: Language, key: NetworkText): string {
  return strings[key][language === "ps" ? 1 : language === "fa" ? 2 : 0];
}
export function networkError(language: Language, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const key = (
    [
      "noAccess",
      "versionConflict",
      "networkApproval",
      "networkInvalid",
      "networkPrivate",
      "networkRate",
    ] as const
  ).find((k) => message.includes(k));
  return networkText(language, key ?? "networkUnavailable");
}
