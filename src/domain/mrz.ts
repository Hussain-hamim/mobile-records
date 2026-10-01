import type { Person } from "./models";

export type MrzError =
  "mrzNotFound" | "mrzInvalid" | "mrzUnsupported" | "mrzAmbiguous";
export type MrzResult =
  | { ok: true; fields: Pick<Person, "name" | "idNumber"> }
  | { ok: false; error: MrzError };

// ICAO Doc 9303 Parts 3/5, TD1. No network, persistence, or raw text in results.
export function mrzCheckDigit(value: string): string {
  if (!/^[A-Z0-9<]+$/.test(value)) throw new Error("Invalid MRZ characters");
  return String(
    [...value].reduce((sum, char, index) => {
      const n =
        char === "<"
          ? 0
          : /[0-9]/.test(char)
            ? Number(char)
            : char.charCodeAt(0) - 55;
      return sum + n * [7, 3, 1][index % 3];
    }, 0) % 10,
  );
}

function validDate(value: string) {
  if (!/^\d{6}$/.test(value)) return false;
  // Validate month/day only. The form does not store birth/expiry dates, so we
  // deliberately do not guess the century or infer age/document validity.
  const year = 2000 + Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseLines(a: string, b: string, c: string): MrzResult {
  const invalid: MrzResult = { ok: false, error: "mrzInvalid" };
  if (![a, b, c].every((line) => /^[A-Z0-9<]{30}$/.test(line))) return invalid;
  if (!/^I[A-Z<]AFG/.test(a) || b.slice(15, 18) !== "AFG") {
    return { ok: false, error: "mrzUnsupported" };
  }
  if (
    !validDate(b.slice(0, 6)) ||
    !validDate(b.slice(8, 14)) ||
    !/^[MF<]$/.test(b[7])
  )
    return invalid;
  if (
    mrzCheckDigit(b.slice(0, 6)) !== b[6] ||
    mrzCheckDigit(b.slice(8, 14)) !== b[14] ||
    mrzCheckDigit(
      a.slice(5) + b.slice(0, 7) + b.slice(8, 15) + b.slice(18, 29),
    ) !== b[29]
  )
    return invalid;

  let number = "";
  if (a[14] === "<") {
    // Standard TD1 extended number: continuation + check digit + filler.
    const extension = a.slice(15).match(/^([A-Z0-9]+)(\d)<+$/);
    if (!extension) return invalid;
    number = a.slice(5, 14) + extension[1];
    if (mrzCheckDigit(number) !== extension[2]) return invalid;
  } else {
    if (mrzCheckDigit(a.slice(5, 14)) !== a[14]) return invalid;
    // Afghan e-ID layout observed in the supplied card: eight digits + filler,
    // a check digit, then five ID digits in optional data. The composite check
    // covers those five digits. Do not interpret arbitrary optional data as ID.
    if (/^\d{8}<$/.test(a.slice(5, 14)) && /^\d{5}<{10}$/.test(a.slice(15))) {
      number = a.slice(5, 13) + a.slice(15, 20);
    }
  }
  if (!/^\d{13}$/.test(number)) return { ok: false, error: "mrzUnsupported" };
  if (!/^[A-Z<]+$/.test(c) || !c.includes("<<")) return invalid;
  const separator = c.indexOf("<<");
  const surname = c.slice(0, separator).replace(/</g, " ").trim();
  const given = c
    .slice(separator + 2)
    .replace(/<+/g, " ")
    .trim();
  if (!surname) return invalid;
  return {
    ok: true,
    fields: {
      name: [given, surname].filter(Boolean).join(" "),
      idNumber: `${number.slice(0, 4)}-${number.slice(4, 8)}-${number.slice(8)}`,
    },
  };
}

export function readAfghanMrz(candidates: string[]): MrzResult {
  let failure: MrzResult = { ok: false, error: "mrzNotFound" };
  const matches = new Map<string, Extract<MrzResult, { ok: true }>>();
  for (const text of candidates) {
    // Whitespace/case only: never invent missing fillers, swap O/0 in names,
    // or repair a failed checksum into an apparently successful read.
    const lines = text
      .toUpperCase()
      .split(/\r?\n/)
      .map((line) => line.replace(/\s/g, ""))
      .filter(Boolean);
    for (let i = 0; i + 2 < lines.length; i++) {
      if (!/^[IAC][A-Z<][A-Z<]{3}/.test(lines[i]) || lines[i].length < 25)
        continue;
      const result = parseLines(lines[i], lines[i + 1], lines[i + 2]);
      if (result.ok) matches.set(JSON.stringify(result.fields), result);
      else failure = result;
    }
  }
  if (matches.size > 1) return { ok: false, error: "mrzAmbiguous" };
  return matches.values().next().value ?? failure;
}
