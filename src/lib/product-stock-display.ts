import type { ProductSaleUnitRow } from "@/components/pharmacy/ProductSaleUnitsEditor";

/**
 * When quantity is stored in base units, show whole bundles of the largest alternate (e.g. boxes of 150 pairs).
 * Returns null if there is no alternate packaging row.
 */
export function formatQuantityAsBundledBase(
  baseQty: number,
  saleUnits: Pick<ProductSaleUnitRow, "unitKey" | "label" | "baseUnitsEach">[]
): string | null {
  if (!Number.isFinite(baseQty) || !saleUnits.length) return null;
  const baseRow = saleUnits.find((u) => u.unitKey === "base" && u.baseUnitsEach === 1);
  if (!baseRow) return null;
  const bundles = saleUnits
    .filter((u) => u.unitKey !== "base" && Math.floor(u.baseUnitsEach) > 1)
    .sort((a, b) => Math.floor(b.baseUnitsEach) - Math.floor(a.baseUnitsEach));
  if (bundles.length === 0) return null;

  const b = bundles[0];
  const each = Math.max(1, Math.floor(b.baseUnitsEach));
  const q = Math.max(0, Math.floor(baseQty));
  const whole = Math.floor(q / each);
  const rem = q % each;
  const bl = (baseRow.label || "base").trim();
  const bul = (b.label || b.unitKey).trim();

  const parts: string[] = [];
  if (whole > 0) parts.push(`${whole} ${bul}`);
  if (rem > 0) parts.push(`${rem} ${bl}`);
  const head = parts.length > 0 ? parts.join(" + ") : `0 ${bl}`;
  return `${head} → ${q} ${bl} on hand (base step)`;
}
