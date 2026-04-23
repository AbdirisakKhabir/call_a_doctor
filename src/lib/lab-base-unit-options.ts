/** Sentinel value for &quot;Other&quot; in base-unit &lt;select&gt; (not stored in DB). */
export const LAB_BASE_UNIT_OTHER = "__other__";

export const LAB_BASE_UNIT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "pcs", label: "pcs — piece(s)" },
  { value: "ea", label: "ea — each" },
  { value: "vial", label: "vial" },
  { value: "tube", label: "tube" },
  { value: "bottle", label: "bottle" },
  { value: "box", label: "box" },
  { value: "pack", label: "pack" },
  { value: "strip", label: "strip" },
  { value: "kit", label: "kit" },
  { value: "pair", label: "pair" },
  { value: "g", label: "g — gram" },
  { value: "mg", label: "mg — milligram" },
  { value: "ml", label: "ml — millilitre" },
  { value: "l", label: "L — litre" },
  { value: "test", label: "test" },
  { value: "slide", label: "slide" },
  { value: "swab", label: "swab" },
];

const PRESET_VALUES = new Set(LAB_BASE_UNIT_OPTIONS.map((o) => o.value));

/**
 * Map a stored DB `unit` string to controlled select + optional custom text.
 */
export function labBaseUnitToSelectState(stored: string): { select: string; custom: string } {
  const raw = (stored || "").trim();
  const t = raw.toLowerCase();
  if (PRESET_VALUES.has(t)) {
    return { select: t, custom: "" };
  }
  return { select: LAB_BASE_UNIT_OTHER, custom: raw };
}

/** Stored `unit` string for API (max length matches Prisma / lab unit label). */
export function labBaseUnitFromSelect(select: string, customTrimmed: string): string {
  if (select === LAB_BASE_UNIT_OTHER) {
    const c = customTrimmed.trim();
    return c.slice(0, 191) || "pcs";
  }
  return select;
}
