import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

/** Stock quantity is always in base units; sale/purchase lines use a unitKey to convert. */
export function normalizeSaleUnitKey(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "base";
  const s = String(raw).trim();
  if (s === "pcs") return "base";
  return s;
}

/** Whole line count (boxes, pieces, …) × units per line → base units on hand. */
export function lineCountToBaseUnits(lineQty: number, baseUnitsEach: number): number {
  const q = Math.max(0, Math.floor(Number(lineQty) || 0));
  const e = Math.max(1, Math.floor(Number(baseUnitsEach) || 1));
  return q * e;
}

export async function getSaleUnitForProduct(
  tx: DbClient,
  productId: number,
  unitKeyRaw: string | null | undefined
) {
  const unitKey = normalizeSaleUnitKey(unitKeyRaw);
  const row = await tx.productSaleUnit.findUnique({
    where: { productId_unitKey: { productId, unitKey } },
  });
  return row;
}

export type SaleUnitInput = { unitKey: string; label: string; baseUnitsEach: number; sortOrder?: number };

/**
 * Next alternate packaging row for the editor: picks a unit key not already used (normalized).
 * Every alternate must have baseUnitsEach &gt; 1 so only the `base` row counts as the single “1 base unit” step.
 */
export function suggestNewAlternateSaleUnitRow(existing: { unitKey: string }[]): {
  unitKey: string;
  label: string;
  baseUnitsEach: number;
} {
  const keys = new Set(existing.map((r) => normalizeSaleUnitKey(r.unitKey)));
  const presets: { key: string; label: string; each: number }[] = [
    { key: "box", label: "Box", each: 100 },
    { key: "strip", label: "Strip", each: 10 },
    { key: "pack", label: "Pack", each: 10 },
    { key: "pair", label: "Pair", each: 2 },
    { key: "carton", label: "Carton", each: 20 },
    { key: "case", label: "Case", each: 50 },
    { key: "bottle", label: "Bottle", each: 30 },
  ];
  for (const p of presets) {
    const nk = normalizeSaleUnitKey(p.key);
    if (!keys.has(nk)) {
      return { unitKey: nk, label: p.label, baseUnitsEach: p.each };
    }
  }
  let n = 2;
  while (keys.has(`alt${n}`)) n += 1;
  return { unitKey: `alt${n}`, label: `Packaging ${n}`, baseUnitsEach: 10 };
}

export function validateSaleUnitsPayload(rows: SaleUnitInput[] | undefined): { ok: true; rows: SaleUnitInput[] } | { ok: false; error: string } {
  if (!rows || rows.length === 0) {
    return { ok: false, error: "At least one sale unit is required (include base)." };
  }
  const keys = new Set<string>();
  let baseCount = 0;
  const normalized: SaleUnitInput[] = [];
  for (const r of rows) {
    const unitKey = normalizeSaleUnitKey(r.unitKey);
    if (keys.has(unitKey)) {
      return { ok: false, error: `Duplicate unit key: ${unitKey}` };
    }
    keys.add(unitKey);
    const label = String(r.label ?? "").trim();
    if (!label) {
      return { ok: false, error: "Each sale unit needs a label." };
    }
    const each = Math.floor(Number(r.baseUnitsEach));
    if (!Number.isFinite(each) || each < 1) {
      return { ok: false, error: `Invalid base-units amount for ${unitKey}` };
    }
    if (each === 1) baseCount += 1;
    normalized.push({
      unitKey,
      label,
      baseUnitsEach: each,
      sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : normalized.length,
    });
  }
  if (baseCount !== 1) {
    return {
      ok: false,
      error: "Define exactly one packaging unit with 1 base unit (the smallest stock step), usually unit key \"base\".",
    };
  }
  const baseRow = normalized.find((x) => x.baseUnitsEach === 1);
  if (!baseRow || baseRow.unitKey !== "base") {
    return { ok: false, error: "The smallest unit must use unit key \"base\" with 1 base unit each." };
  }

  const baseLabelLower = baseRow.label.toLowerCase();
  const baseLabelImpliesWholeBox = /\bbox(?:es)?\b/.test(baseLabelLower);
  if (baseLabelImpliesWholeBox) {
    for (const u of normalized) {
      if (u.unitKey === "base") continue;
      const labelLower = u.label.toLowerCase();
      const uk = normalizeSaleUnitKey(u.unitKey);
      const looksLikePair = uk === "pair" || /\bpair(?:s)?\b/.test(labelLower);
      if (looksLikePair) {
        return {
          ok: false,
          error:
            'The base row is labeled like a whole box, but you also added a "pair" unit. One pair is smaller than one box; stock only supports whole multiples of the base step (not "1 pair = 1/150 box"). Fix: keep key base as your smallest sellable step—label it Pair (1 base = 1 pair). Add a second row with key box and Base units each = pairs per box (e.g. 150). Purchasing 3 boxes adds 450 to quantity. Selling 1 pair at POS deducts 1.',
        };
      }
    }
  }

  return { ok: true, rows: normalized.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) };
}

export async function replaceProductSaleUnits(
  tx: Prisma.TransactionClient,
  productId: number,
  rows: SaleUnitInput[]
) {
  await tx.productSaleUnit.deleteMany({ where: { productId } });
  for (const r of rows) {
    await tx.productSaleUnit.create({
      data: {
        productId,
        unitKey: normalizeSaleUnitKey(r.unitKey),
        label: String(r.label).trim(),
        baseUnitsEach: Math.floor(Number(r.baseUnitsEach)),
        sortOrder: r.sortOrder ?? 0,
      },
    });
  }
}
