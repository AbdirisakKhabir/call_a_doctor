import { lineCountToBaseUnits, normalizeSaleUnitKey } from "@/lib/product-sale-units";

/** Minimal shape for conversion math (matches {@link ProductSaleUnit} / editor rows). */
export type SaleUnitLike = { unitKey: string; label: string; baseUnitsEach: number };

export function getBaseUnitLabel(saleUnits: SaleUnitLike[]): string {
  const base = saleUnits.find((u) => normalizeSaleUnitKey(u.unitKey) === "base");
  return (base?.label ?? "Base unit").trim() || "Base unit";
}

export type UnitConversionSummary = {
  intro: string;
  /** Each defined unit and how many base steps one count represents */
  toBase: { unitLabel: string; unitKey: string; baseUnitsEach: number; baseLabel: string }[];
  /** Integer ratios between two packagings when one divides the other */
  pairwise: string[];
};

export function buildUnitConversionSummary(saleUnits: SaleUnitLike[]): UnitConversionSummary | null {
  if (!saleUnits.length) return null;
  const baseLabel = getBaseUnitLabel(saleUnits);
  const intro = `Stock, POS, and purchases convert every line to ${baseLabel} (the row with key base and Base units each = 1). Larger packagings use Base units each > 1 (e.g. box = 150 means one box holds 150 ${baseLabel.toLowerCase()}s).`;
  const toBase = saleUnits.map((u) => ({
    unitLabel: u.label.trim() || u.unitKey,
    unitKey: u.unitKey,
    baseUnitsEach: Math.max(1, Math.floor(u.baseUnitsEach) || 1),
    baseLabel,
  }));
  const pairwise = computePairwiseConversions(saleUnits);
  return { intro, toBase, pairwise };
}

function computePairwiseConversions(saleUnits: SaleUnitLike[]): string[] {
  const rows = saleUnits.map((u) => ({
    ...u,
    baseUnitsEach: Math.max(1, Math.floor(u.baseUnitsEach) || 1),
  }));
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      const ba = a.baseUnitsEach;
      const bb = b.baseUnitsEach;
      if (bb % ba === 0 && bb !== ba) {
        const k = bb / ba;
        const key = `${a.unitKey}<${b.unitKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(`1 ${b.label} = ${k} ${a.label}`);
        }
      } else if (ba % bb === 0 && ba !== bb) {
        const k = ba / bb;
        const key = `${b.unitKey}<${a.unitKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(`1 ${a.label} = ${k} ${b.label}`);
        }
      }
    }
  }
  return out;
}

/**
 * Convert a count in `fromKey` to an equivalent count in `toKey` (may be fractional).
 * Uses base units as pivot: qty × from.baseUnitsEach ÷ to.baseUnitsEach.
 */
export function convertQuantityBetweenUnits(
  quantity: number,
  fromKey: string,
  toKey: string,
  saleUnits: SaleUnitLike[]
): number | null {
  const fk = normalizeSaleUnitKey(fromKey);
  const tk = normalizeSaleUnitKey(toKey);
  const from = saleUnits.find((u) => normalizeSaleUnitKey(u.unitKey) === fk);
  const to = saleUnits.find((u) => normalizeSaleUnitKey(u.unitKey) === tk);
  if (!from || !to) return null;
  const base = lineCountToBaseUnits(quantity, from.baseUnitsEach);
  const div = Math.max(1, Math.floor(to.baseUnitsEach) || 1);
  return base / div;
}

/** How many base units a line quantity represents (POS / purchase / stock line). */
export function lineQuantityToBaseUnitsForProduct(
  quantity: number,
  unitKey: string,
  saleUnits: SaleUnitLike[]
): number | null {
  const u = saleUnits.find((x) => normalizeSaleUnitKey(x.unitKey) === normalizeSaleUnitKey(unitKey));
  if (!u) return null;
  return lineCountToBaseUnits(quantity, u.baseUnitsEach);
}
