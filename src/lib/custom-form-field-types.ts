export const CUSTOM_FORM_FIELD_TYPES = [
  { value: "SHORT_TEXT", label: "Short answer" },
  { value: "LONG_TEXT", label: "Paragraph" },
  { value: "EMAIL", label: "Email" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Yes / No checkbox" },
  { value: "RADIO", label: "Multiple choice (one)" },
  { value: "SELECT", label: "Dropdown" },
  { value: "MULTI_CHECK", label: "Checkboxes (many)" },
] as const;

export type CustomFormFieldType = (typeof CUSTOM_FORM_FIELD_TYPES)[number]["value"];

const ALLOWED = new Set(CUSTOM_FORM_FIELD_TYPES.map((t) => t.value));

export function isCustomFormFieldType(v: string): v is CustomFormFieldType {
  return ALLOWED.has(v as CustomFormFieldType);
}

export function fieldTypeNeedsOptions(fieldType: string): boolean {
  return fieldType === "RADIO" || fieldType === "SELECT" || fieldType === "MULTI_CHECK";
}

export function normalizeOptions(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out = raw
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((s) => s.length > 0);
  return out.length ? out : null;
}
