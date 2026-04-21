/**
 * Sale/purchase line quantities are counted in the selected {@link ProductSaleUnit} (unitKey).
 * Product.quantity is always in base (smallest) units.
 */

import { lineCountToBaseUnits, normalizeSaleUnitKey } from "@/lib/product-sale-units";

export type { SaleUnitInput } from "@/lib/product-sale-units";

/** @deprecated use normalizeSaleUnitKey */
export function parseSaleUnit(raw: unknown): string {
  return normalizeSaleUnitKey(typeof raw === "string" ? raw : null);
}

/** Convert a line quantity in the given sale unit to base units for stock. */
export function lineQuantityToBaseUnits(quantity: number, baseUnitsEach: number): number {
  return lineCountToBaseUnits(quantity, baseUnitsEach);
}

/** @deprecated alias for lineQuantityToBaseUnits */
export function lineQuantityToPcs(quantity: number, baseUnitsEach = 1): number {
  return lineQuantityToBaseUnits(quantity, baseUnitsEach);
}
