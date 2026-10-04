import type { Language, Person } from "./models";
import { digits } from "./validation";

// Accept labelled text only. Never assign arbitrary OCR lines by their position
// on a particular card, or infer relatives/address from the holder's name.
const labels: Partial<Record<Exclude<keyof Person, "idType">, string[]>> = {
  grandfatherName: [
    "Grandfather's name",
    "Grandfather name",
    "Grand father's name",
    "نام پدر کلان",
    "نام پدرکلان",
    "نام پدر بزرگ",
    "د نیکه نوم",
  ],
  fatherName: [
    "Father's name",
    "Father name",
    "Name of father",
    "نام پدر",
    "ولد",
    "د پلار نوم",
  ],
  name: ["Full name", "Name", "نام مکمل", "نام", "بشپړ نوم", "نوم"],
  idNumber: [
    "ID number",
    "Identity number",
    "National ID number",
    "Tazkira number",
    "شماره تذکره",
    "نمبر تذکره",
    "د تذکرې شمېره",
  ],
  idVolume: ["Volume", "جلد", "د تذکرې جلد"],
  idPage: ["Page", "صفحه", "پاڼه", "د تذکرې پاڼه"],
  originalAddress: [
    "Original residence",
    "Permanent address",
    "Original address",
    "سکونت اصلی",
    "محل سکونت اصلی",
    "اصلي استوګنځی",
  ],
  currentAddress: [
    "Current residence",
    "Current address",
    "Present address",
    "سکونت فعلی",
    "محل سکونت فعلی",
    "اوسنی استوګنځی",
  ],
  dateOfBirth: [
    "Date of birth",
    "Birth date",
    "DOB",
    "تاریخ تولد",
    "د زیږیدو نیټه",
    "د زېږېدو نېټه",
  ],
  gender: ["Gender", "Sex", "جنسیت", "جنس", "جنسيت"],
  nationality: ["Nationality", "تابعیت", "تابعيت"],
  occupation: ["Occupation", "Profession", "شغل", "وظیفه", "دنده"],
  workplace: [
    "Workplace",
    "Place of work",
    "محل وظیفه",
    "محل کار",
    "د دندې ځای",
  ],
  phone: [
    "Phone",
    "Phone number",
    "Telephone",
    "شماره تماس",
    "شماره تلفن",
    "د اړیکې شمېره",
  ],
  relativePhone: [
    "Relative phone",
    "Relative's phone",
    "شماره تماس اقارب",
    "د خپلوانو شمېره",
  ],
};

function clean(value: string) {
  return digits(value)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function labelText(value: string) {
  return value
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[’‘]/g, "'");
}
const patterns = Object.entries(labels).map(([key, names]) => {
  const aliases = names
    .map((name) =>
      labelText(name)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/ /g, "\\s+"),
    )
    .join("|");
  const pattern = `(?:${aliases})(?:\\s*/\\s*(?:${aliases}))*`;
  return {
    key: key as Exclude<keyof Person, "idType">,
    only: new RegExp(`^(?:${pattern})\\s*[:：=-]?$`, "iu"),
    before: new RegExp(`^(?:${pattern})(?:\\s*[:：=]\\s*|\\s+)(.+)$`, "iu"),
    after: new RegExp(`^(.+?)\\s*[:：=]\\s*(?:${pattern})$`, "iu"),
  };
});
export function isPrintedLabel(text: string) {
  return patterns.some((p) => p.only.test(labelText(clean(text))));
}

function valueFor(
  key: Exclude<keyof Person, "idType">,
  raw: string,
): string | null {
  const value = clean(raw);
  if (
    !value ||
    value.length > 180 ||
    /[<>:：=]/.test(value) ||
    patterns.some((p) => p.only.test(labelText(value)))
  )
    return null;
  if (["name", "fatherName", "grandfatherName"].includes(key))
    return value.length <= 100 &&
      /^[\p{L}\p{M} .’'\-]+$/u.test(value) &&
      (value.match(/\p{L}/gu)?.length ?? 0) >= 2
      ? value
      : null;
  if (["idNumber", "idVolume", "idPage"].includes(key))
    return /^[0-9][0-9 /-]{0,28}$/.test(value) ? value : null;
  if (["phone", "relativePhone"].includes(key))
    return /^\+?[0-9 ()-]+$/.test(value) &&
      /^[0-9]{7,15}$/.test(value.replace(/\D/g, ""))
      ? value
      : null;
  if (key === "dateOfBirth") {
    // Preserve the printed calendar/order; do not guess a century or convert
    // a Solar Hijri date into Gregorian. Require an explicit four-digit year.
    return value.length <= 50 &&
      /\b\d{4}\b/.test(value) &&
      /^[\p{L}\p{M}0-9\s/.,()\-]+$/u.test(value)
      ? value
      : null;
  }
  if (key === "gender") {
    if (/^(M|male|مرد|نارینه)$/iu.test(value)) return "M";
    if (/^(F|female|زن|ښځینه)$/iu.test(value)) return "F";
    return null;
  }
  if (
    key === "nationality" &&
    /^(AFG|Afghan|Afghanistan|افغان|افغانستان)$/iu.test(value)
  )
    return "AFG";
  return /\p{L}/u.test(value) ? value : null;
}

export function extractPrintedPerson(
  text: string,
  language: Language,
): Partial<Person> {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const candidates = new Map<Exclude<keyof Person, "idType">, Set<string>>();
  for (let i = 0; i < lines.length; i++) {
    const line = labelText(lines[i]);
    for (const pattern of patterns) {
      const match = line.match(pattern.before) ?? line.match(pattern.after);
      const raw =
        match?.[1] ?? (pattern.only.test(line) ? lines[i + 1] : undefined);
      if (raw === undefined) continue;
      const value = valueFor(pattern.key, raw);
      if (value) {
        const values = candidates.get(pattern.key) ?? new Set<string>();
        values.add(value);
        candidates.set(pattern.key, values);
      }
      break;
    }
  }
  const fields: Partial<Person> = {};
  for (const [key, values] of candidates) {
    // On bilingual cards prefer the UI script, but omit contradictory values
    // in the same script rather than silently choosing one of them.
    const preferred = [...values].filter(
      (value) => /[\u0600-\u06ff]/.test(value) === (language !== "en"),
    );
    const options = preferred.length ? preferred : [...values];
    if (options.length === 1) fields[key] = options[0];
  }
  return fields;
}

export function mergeScanFields(
  current: Person,
  incoming: Partial<Person>,
): Person {
  const result = { ...current };
  for (const [key, value] of Object.entries(incoming) as [
    Exclude<keyof Person, "idType">,
    string,
  ][]) {
    // Preserve previously reviewed values and MRZ results when scanning the
    // other side. Editing an existing suggestion remains an explicit action.
    if (!result[key]?.trim() && value?.trim()) result[key] = value;
  }
  return result;
}
