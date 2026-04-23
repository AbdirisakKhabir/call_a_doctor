import { fieldTypeNeedsOptions } from "@/lib/custom-form-field-types";

/** Normalize client answer to stored string; returns null if empty and not valid falsey checkbox. */
export function encodeFormAnswer(fieldType: string, raw: unknown): string | null {
  if (fieldType === "CHECKBOX") {
    if (raw === true || raw === "true" || raw === 1 || raw === "1") return "1";
    if (raw === false || raw === "false" || raw === 0 || raw === "0" || raw == null || raw === "") return "0";
    return "0";
  }

  if (fieldType === "MULTI_CHECK") {
    if (raw == null) return null;
    const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
    const strings = arr.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter(Boolean);
    if (strings.length === 0) return null;
    return JSON.stringify(strings);
  }

  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  return s.length ? s : null;
}

export function isAnswerEmpty(fieldType: string, encoded: string | null): boolean {
  if (encoded == null) return true;
  if (fieldType === "CHECKBOX") return false; // "0" is valid
  if (fieldType === "MULTI_CHECK") {
    try {
      const a = JSON.parse(encoded) as unknown;
      return !Array.isArray(a) || a.length === 0;
    } catch {
      return true;
    }
  }
  return encoded.trim() === "";
}

export function decodeOptionsList(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.map((x) => (typeof x === "string" ? x : String(x)));
}

export function validateAnswerAgainstOptions(
  fieldType: string,
  encoded: string | null,
  options: string[]
): boolean {
  if (!fieldTypeNeedsOptions(fieldType)) return true;
  if (encoded == null) return false;
  if (fieldType === "MULTI_CHECK") {
    try {
      const arr = JSON.parse(encoded) as unknown;
      if (!Array.isArray(arr)) return false;
      return arr.every((x) => typeof x === "string" && options.includes(x));
    } catch {
      return false;
    }
  }
  return options.includes(encoded);
}
