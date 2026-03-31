/**
 * Inventory quantity is always stored in pieces (pcs).
 * Optional hierarchy: 1 carton = boxesPerCarton × pcsPerBox pcs; 1 box = pcsPerBox pcs.
 * Null fields mean that packaging level is not used.
 */

export type SaleUnit = "pcs" | "box" | "carton";

export type ProductPackaging = {
  boxesPerCarton: number | null;
  pcsPerBox: number | null;
};

export function parseSaleUnit(raw: unknown): SaleUnit {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "box" || s === "carton" || s === "pcs") return s;
  return "pcs";
}

/** Pieces per one sale unit; null if that unit is not configured for the product. */
export function pcsPerSaleUnit(p: ProductPackaging, unit: SaleUnit): number | null {
  if (unit === "pcs") return 1;
  if (unit === "box") {
    if (p.pcsPerBox == null || p.pcsPerBox <= 0) return null;
    return p.pcsPerBox;
  }
  if (unit === "carton") {
    if (
      p.boxesPerCarton == null ||
      p.pcsPerBox == null ||
      p.boxesPerCarton <= 0 ||
      p.pcsPerBox <= 0
    ) {
      return null;
    }
    return p.boxesPerCarton * p.pcsPerBox;
  }
  return null;
}

/** Convert a counted quantity in `unit` to integer pcs. */
export function quantityInUnitToPcs(
  p: ProductPackaging,
  amount: number,
  unit: SaleUnit
): { pcs: number } | { error: string } {
  const per = pcsPerSaleUnit(p, unit);
  if (per == null) {
    if (unit === "box") {
      return { error: "This product has no pieces-per-box set; use pcs or set packaging on the product." };
    }
    return {
      error:
        "This product has no carton/box packaging set; use pcs or set boxes per carton and pieces per box on the product.",
    };
  }
  const n = Math.max(0, Math.floor(amount));
  return { pcs: n * per };
}

/** Which units are valid for this product (always includes pcs). */
export function availableSaleUnits(p: ProductPackaging): SaleUnit[] {
  const out: SaleUnit[] = ["pcs"];
  if (p.pcsPerBox != null && p.pcsPerBox > 0) out.push("box");
  if (
    p.boxesPerCarton != null &&
    p.pcsPerBox != null &&
    p.boxesPerCarton > 0 &&
    p.pcsPerBox > 0
  ) {
    out.push("carton");
  }
  return out;
}

/** Max whole units of `unit` that can be taken from `quantityPcs` on hand. */
export function maxWholeUnits(quantityPcs: number, p: ProductPackaging, unit: SaleUnit): number {
  const per = pcsPerSaleUnit(p, unit);
  if (per == null || per <= 0) return 0;
  return Math.floor(quantityPcs / per);
}

export function unitLabel(unit: SaleUnit): string {
  if (unit === "pcs") return "pcs";
  if (unit === "box") return "box";
  return "carton";
}
