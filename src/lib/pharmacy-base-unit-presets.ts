import { LAB_BASE_UNIT_OPTIONS } from "@/lib/lab-base-unit-options";

/** Base-unit dropdown for pharmacy inventory (same preset types as lab inventory). */
export const PHARMACY_BASE_UNIT_PRESET_OPTIONS = LAB_BASE_UNIT_OPTIONS;

/**
 * Label for the sale-units “base” row when the product `unit` preset changes.
 * Uses the short segment before " — " from the preset label (e.g. ml, bottle).
 */
export function pharmacyBaseUnitRowLabel(unitField: string): string {
  const u = (unitField || "pcs").trim().toLowerCase();
  if (u === "pcs") return "Piece";
  const opt = LAB_BASE_UNIT_OPTIONS.find((o) => o.value === u);
  if (opt) return opt.label.split(" — ")[0].trim();
  const raw = (unitField || "pcs").trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Piece";
}
