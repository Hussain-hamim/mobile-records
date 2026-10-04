import type { Language, Person } from "./models";
import { extractPrintedPerson, isPrintedLabel } from "./printed-id";
import { digits } from "./validation";
import type { MrzRegion } from "./mrz-capture";

export type Point = { x: number; y: number };
export type CardCorners = [Point, Point, Point, Point]; // TL, TR, BR, BL; normalized
export type ScanPhoto = { uri: string; width: number; height: number };
export type OcrWord = {
  text: string;
  confidence: number;
  box: [number, number, number, number];
  line: number;
};
export type OcrDocument = {
  text: string;
  words: OcrWord[];
  width: number;
  height: number;
};
export type ScanCandidate = {
  key: Exclude<keyof Person, "idType">;
  value: string;
  source: "offline" | "google";
  confidence: number;
  mrzChecked: boolean;
};
export type ScanConflict = {
  key: Exclude<keyof Person, "idType">;
  current: string;
  candidate: ScanCandidate;
};
export const defaultCorners = (): CardCorners => [
  { x: 0.06, y: 0.15 },
  { x: 0.94, y: 0.15 },
  { x: 0.94, y: 0.85 },
  { x: 0.06, y: 0.85 },
];
export function validCorners(points: CardCorners) {
  if (
    points.length !== 4 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i],
      b = points[(i + 1) % 4],
      c = points[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.002)
      return false;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2 >= 0.03;
}
const normalized = (value: string) =>
  digits(value)
    .replace(/[\s\-/]/g, "")
    .toLowerCase();
export function mergeCandidates(current: Person, candidates: ScanCandidate[]) {
  const fields = { ...current };
  const conflicts: ScanConflict[] = [];
  const mismatch = candidates.some(
    (c) =>
      c.key === "idNumber" &&
      current.idNumber &&
      normalized(current.idNumber) !== normalized(c.value),
  );
  for (const candidate of candidates) {
    const value = current[candidate.key] ?? "";
    if (value && normalized(value) !== normalized(candidate.value))
      conflicts.push({ key: candidate.key, current: value, candidate });
    else if (!value && !mismatch) {
      const alternatives = candidates.filter((c) => c.key === candidate.key);
      if (new Set(alternatives.map((c) => normalized(c.value))).size > 1)
        conflicts.push({ key: candidate.key, current: "", candidate });
      else fields[candidate.key] = candidate.value;
    }
  }
  return { fields, conflicts, identityMismatch: mismatch };
}
export function documentCandidates(
  doc: OcrDocument,
  language: Language,
  source: ScanCandidate["source"],
): ScanCandidate[] {
  const groups = new Map<number, OcrWord[]>();
  for (const word of doc.words) {
    if (!word.text.trim()) continue;
    groups.set(word.line, [...(groups.get(word.line) ?? []), word]);
  }
  // A text line can span two distant bilingual columns. Preserve the engine's
  // reading order inside each fragment, but don't join across a large gap.
  const fragments: OcrWord[][] = [];
  for (const words of groups.values()) {
    let fragment: OcrWord[] = [];
    for (const word of words) {
      const previous = fragment.at(-1);
      const gap = previous
        ? Math.max(word.box[0] - previous.box[2], previous.box[0] - word.box[2])
        : 0;
      const height = Math.max(1, word.box[3] - word.box[1]);
      if (previous && gap > Math.max(height * 2.5, doc.width * 0.04)) {
        fragments.push(fragment);
        fragment = [];
      }
      fragment.push(word);
    }
    if (fragment.length) fragments.push(fragment);
  }
  const lines = fragments.map((words) => ({
    text: words.map((w) => w.text).join(" "),
    confidence: words.reduce((n, w) => n + w.confidence, 0) / words.length,
    x: Math.min(...words.map((w) => w.box[0])),
    y: Math.min(...words.map((w) => w.box[1])),
    right: Math.max(...words.map((w) => w.box[2])),
    bottom: Math.max(...words.map((w) => w.box[3])),
  }));
  const candidates: ScanCandidate[] = [];
  const add = (text: string, confidence: number) => {
    if (confidence < 45) return;
    for (const [key, value] of Object.entries(
      extractPrintedPerson(text, language),
    )) {
      if (value)
        candidates.push({
          key: key as Exclude<keyof Person, "idType">,
          value,
          source,
          confidence,
          mrzChecked: false,
        });
    }
  };
  for (const line of lines) {
    add(line.text, line.confidence);
    if (!isPrintedLabel(line.text)) continue;
    // Label-only fragments: pair with the nearest value in the same row or
    // directly below its column. Never walk arbitrary global OCR line order.
    const h = Math.max(1, line.bottom - line.y);
    const nearby = lines
      .filter((v) => v !== line && !isPrintedLabel(v.text))
      .map((v) => ({
        v,
        same:
          Math.abs((v.y + v.bottom - line.y - line.bottom) / 2) < h * 0.7 &&
          Math.min(Math.abs(v.x - line.right), Math.abs(line.x - v.right)) <
            doc.width * 0.25,
        below:
          v.y >= line.bottom - h * 0.2 &&
          v.y - line.bottom < h * 2 &&
          Math.min(line.right, v.right) > Math.max(line.x, v.x),
        distance:
          Math.abs((v.y + v.bottom - line.y - line.bottom) / 2) * 3 +
          Math.min(Math.abs(v.x - line.right), Math.abs(line.x - v.right)),
      }))
      .filter((v) => v.same || v.below)
      .sort((a, b) => a.distance - b.distance);
    if (
      nearby[0] &&
      (!nearby[1] || nearby[1].distance > nearby[0].distance * 1.2)
    )
      add(
        line.text + "\n" + nearby[0].v.text,
        Math.min(line.confidence, nearby[0].v.confidence),
      );
  }
  // Older native builds lack geometry. The guided flow requires a new build,
  // but keeping this fallback supports existing service callers.
  if (!doc.words.length) add(doc.text, 45);
  return consolidateCandidates(candidates, language);
}
export function consolidateCandidates(
  candidates: ScanCandidate[],
  language: Language,
) {
  const preferred = (value: string) =>
    /[\u0600-\u06ff]/.test(value) === (language !== "en");
  const result: ScanCandidate[] = [];
  for (const key of new Set(candidates.map((c) => c.key))) {
    const all = candidates.filter((c) => c.key === key);
    const selected =
      key !== "name" && all.some((c) => c.mrzChecked)
        ? all.filter((c) => c.mrzChecked)
        : all.some((c) => preferred(c.value))
          ? all.filter((c) => preferred(c.value))
          : all;
    // Disagreement stays visible as alternatives instead of being guessed.
    for (const value of new Set(selected.map((c) => normalized(c.value)))) {
      result.push(
        selected
          .filter((c) => normalized(c.value) === value)
          .sort((a, b) => b.confidence - a.confidence)[0],
      );
    }
  }
  return result;
}
export function mrzBand(doc: OcrDocument): MrzRegion {
  const words = doc.words.filter((w) => w.text.includes("<"));
  if (!words.length) return [0, 0.55, 1, 0.45];
  if (new Set(words.map((w) => w.line)).size < 3) {
    const top = words.length
      ? Math.max(
          0,
          Math.min(
            0.55,
            Math.min(...words.map((w) => w.box[1])) / doc.height - 0.03,
          ),
        )
      : 0.55;
    return [0, top, 1, 1 - top];
  }
  const x = Math.max(
    0,
    Math.min(...words.map((w) => w.box[0])) / doc.width - 0.03,
  );
  const y = Math.max(
    0,
    Math.min(...words.map((w) => w.box[1])) / doc.height - 0.03,
  );
  const right = Math.min(
    1,
    Math.max(...words.map((w) => w.box[2])) / doc.width + 0.03,
  );
  const bottom = Math.min(
    1,
    Math.max(...words.map((w) => w.box[3])) / doc.height + 0.03,
  );
  return [x, y, right - x, bottom - y];
}
