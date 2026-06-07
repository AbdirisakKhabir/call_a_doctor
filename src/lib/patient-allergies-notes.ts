/** Stored in `Patient.notes` for standardized allergies / infections chart line. */

const NO_LINE = "Allergies/infections: No";
const YES_PREFIX = "Allergies/infections: Yes — ";

export type AllergiesInfectionsSelection = "" | "yes" | "no";

export function encodeAllergiesInfectionsNotes(
  selection: "yes" | "no",
  detail: string
): string {
  const d = detail.trim();
  if (selection === "no") return NO_LINE;
  return `${YES_PREFIX}${d}`;
}

export function parseAllergiesInfectionsFromNotes(
  notes: string | null | undefined
): { selection: AllergiesInfectionsSelection; detail: string } {
  const raw = (notes ?? "").trim();
  if (!raw) return { selection: "", detail: "" };
  if (raw === NO_LINE) return { selection: "no", detail: "" };
  if (raw.startsWith(YES_PREFIX)) {
    return { selection: "yes", detail: raw.slice(YES_PREFIX.length) };
  }
  return { selection: "", detail: raw };
}
