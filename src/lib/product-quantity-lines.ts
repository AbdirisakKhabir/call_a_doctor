import { normalizeSaleUnitKey } from "@/lib/product-sale-units";

export type PackagingQuantityLine = { unitKey: string; quantity: number };

/**
 * Sum stock entered as counts in different packagings (boxes, pcs, …) into base units using sale unit definitions.
 */
export function computeBaseQuantityFromPackagingLines(
  lines: PackagingQuantityLine[],
  saleUnits: { unitKey: string; baseUnitsEach: number }[]
): { ok: true; base: number } | { ok: false; error: string } {
  if (!lines.length) {
    return { ok: false, error: "Add at least one quantity line." };
  }
  const map = new Map(saleUnits.map((u) => [normalizeSaleUnitKey(u.unitKey), Math.max(1, Math.floor(u.baseUnitsEach))]));
  let total = 0;
  for (const line of lines) {
    const key = normalizeSaleUnitKey(line.unitKey);
    const each = map.get(key);
    if (each == null) {
      return { ok: false, error: `Unknown unit key: ${key}. Add it under packaging / sale units first.` };
    }
    const q = Number(line.quantity);
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, error: "Each line needs a non-negative quantity." };
    }
    total += Math.floor(q) * each;
  }
  return { ok: true, base: total };
}
