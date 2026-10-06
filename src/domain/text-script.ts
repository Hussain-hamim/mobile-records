import type { Language } from "./models";
import { digits } from "./validation";

const arabic = /\p{Script=Arabic}/u;
const joiningOrMark = /[\p{Mark}\u200c\u200d]/u;
const latinOrNumber = /[\p{Script=Latin}\p{Number}]/u;

export function hasArabicText(text: string): boolean {
  return arabic.test(digits(text));
}

export function localScriptFont(language: Language) {
  return language === "ps" ? "BahijBaraem" : "Noto";
}

/** Keep whole Arabic letter/mark sequences together for native text shaping. */
export function textRuns(value: string): { text: string; local: boolean }[] {
  const runs: { text: string; local: boolean }[] = [];
  for (const character of digits(value)) {
    const previous = runs[runs.length - 1];
    const local =
      arabic.test(character) ||
      (previous?.local === true && joiningOrMark.test(character));
    if (previous?.local === local) previous.text += character;
    else runs.push({ text: character, local });
  }
  return runs;
}

/**
 * Native editable inputs have one font. Mixed values use the system font and
 * its Arabic fallback so Latin letters and numbers never use a custom font.
 */
export function inputTypography(value: string, language: Language) {
  const text = digits(value);
  const local = hasArabicText(text);
  return {
    fontFamily:
      local && !latinOrNumber.test(text)
        ? localScriptFont(language)
        : undefined,
    writingDirection: local ? ("rtl" as const) : ("ltr" as const),
  };
}
