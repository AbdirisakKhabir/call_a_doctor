/**
 * Sale and purchase line quantities are always in pieces (pcs).
 * `saleUnit` / `purchaseUnit` on persisted rows are always `"pcs"`.
 */

export type SaleUnit = "pcs";

export function parseSaleUnit(_raw: unknown): SaleUnit {
  return "pcs";
}

/** Convert a line quantity to integer pcs (quantities are already in pcs). */
export function lineQuantityToPcs(quantity: number): number {
  return Math.max(0, Math.floor(Number(quantity) || 0));
}
