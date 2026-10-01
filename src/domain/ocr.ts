import type { Person } from "./models";
import { digits } from "./validation";
// Conservative, label-anchored extraction. Never guess a name from an unlabelled line.
const labels: Partial<Record<keyof Person, RegExp>> = {
  name: /^(?:name|full name|نوم|نام)\s*[:：]\s*(.+)$/i,
  fatherName: /^(?:father(?:'s)? name|د پلار نوم|نام پدر)\s*[:：]\s*(.+)$/i,
  grandfatherName:
    /^(?:grandfather(?:'s)? name|د نیکه نوم|نام پدر کلان)\s*[:：]\s*(.+)$/i,
  idNumber:
    /^(?:id(?:entity)? (?:no\.?|number)|national id|د تذکرې شمېره|د تذکرې نمبر|شماره تذکره)\s*[:：]\s*([\d۰-۹٠-٩ -]+)$/i,
  originalAddress:
    /^(?:place of birth|اصلي استوګنځی|محل تولد)\s*[:：]\s*(.+)$/i,
};
export function extractPerson(text: string): Partial<Person> {
  const result: Partial<Person> = {};
  for (const line of text.split(/\r?\n/).map((s) => s.trim())) {
    for (const [key, pattern] of Object.entries(labels)) {
      const match = line.match(pattern);
      if (match && !(key in result))
        result[key as keyof Person] =
          key === "idNumber" ? digits(match[1]).trim() : match[1].trim();
    }
  }
  return result;
}
