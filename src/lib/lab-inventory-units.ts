import type { Prisma } from "@prisma/client";
import { normalizeSaleUnitKey } from "@/lib/product-sale-units";

export function normalizeLabUnitKey(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "base";
  return String(raw).trim().toLowerCase();
}

export type LabInventoryUnitInput = {
  unitKey: string;
  label: string;
  baseUnitsEach: number;
  sortOrder?: number;
};

export function validateLabInventoryUnitsPayload(
  rows: LabInventoryUnitInput[] | undefined
): { ok: true; rows: LabInventoryUnitInput[] } | { ok: false; error: string } {
  if (!rows || rows.length === 0) {
    return { ok: false, error: "At least one packaging unit is required (include base)." };
  }
  const keys = new Set<string>();
  let baseCount = 0;
  const normalized: LabInventoryUnitInput[] = [];
  for (const r of rows) {
    const unitKey = normalizeLabUnitKey(r.unitKey);
    if (keys.has(unitKey)) {
      return { ok: false, error: `Duplicate unit key: ${unitKey}` };
    }
    keys.add(unitKey);
    const label = String(r.label ?? "").trim();
    if (!label) {
      return { ok: false, error: "Each unit needs a label." };
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
      error: 'Define exactly one unit with 1 base unit each, using unit key "base".',
    };
  }
  const baseRow = normalized.find((x) => x.baseUnitsEach === 1);
  if (!baseRow || baseRow.unitKey !== "base") {
    return {
      ok: false,
      error: 'The smallest stock step must use unit key "base" with 1 base unit each.',
    };
  }
  return { ok: true, rows: normalized.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) };
}

export async function replaceLabInventoryUnits(
  tx: Prisma.TransactionClient,
  labInventoryItemId: number,
  rows: LabInventoryUnitInput[]
) {
  await tx.labInventoryUnit.deleteMany({ where: { labInventoryItemId } });
  for (const r of rows) {
    await tx.labInventoryUnit.create({
      data: {
        labInventoryItemId,
        unitKey: normalizeLabUnitKey(r.unitKey),
        label: String(r.label).trim(),
        baseUnitsEach: Math.floor(Number(r.baseUnitsEach)),
        sortOrder: r.sortOrder ?? 0,
      },
    });
  }
}

/** Sum stock entered as counts in different lab packagings into base units (same idea as pharmacy packaging lines). */
export function computeBaseQuantityFromLabPackagingLines(
  lines: { unitKey: string; quantity: number }[],
  labUnits: { unitKey: string; baseUnitsEach: number }[]
): { ok: true; base: number } | { ok: false; error: string } {
  if (!lines.length) {
    return { ok: false, error: "Add at least one quantity line." };
  }
  const map = new Map(
    labUnits.map((u) => [normalizeLabUnitKey(u.unitKey), Math.max(1, Math.floor(Number(u.baseUnitsEach) || 1))])
  );
  let total = 0;
  for (const line of lines) {
    const key = normalizeLabUnitKey(line.unitKey);
    const each = map.get(key);
    if (each == null) {
      return { ok: false, error: `Unknown unit key: ${key}. Configure packaging units for this lab item first.` };
    }
    const q = Number(line.quantity);
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, error: "Each line needs a non-negative quantity." };
    }
    total += Math.floor(q) * each;
  }
  return { ok: true, base: total };
}

/** Convert a quantity expressed in `unitKey` to whole base units for stock deduction. */
export function labUnitsToBaseQuantity(unitsPerTest: number, baseUnitsEach: number): number {
  const u = Number(unitsPerTest);
  const e = Math.max(1, Math.floor(Number(baseUnitsEach) || 1));
  if (!Number.isFinite(u) || u <= 0) return 0;
  const raw = u * e;
  return Math.max(1, Math.ceil(raw - 1e-12));
}

export type PackagingOption = { unitKey: string; label: string; baseUnitsEach: number };

/** Lab-configured units win on key collision; pharmacy-only keys are appended for UI and sync. */
export function mergeLabUnitsWithPharmacySaleUnits(
  labUnits: { unitKey: string; label: string; baseUnitsEach: number; sortOrder?: number }[],
  pharmacySaleUnits: { unitKey: string; label: string; baseUnitsEach: number; sortOrder?: number }[]
): PackagingOption[] {
  type Row = PackagingOption & { _sort: number };
  const map = new Map<string, Row>();
  for (const u of labUnits) {
    const k = normalizeLabUnitKey(u.unitKey);
    if (map.has(k)) continue;
    const so = typeof u.sortOrder === "number" ? u.sortOrder : map.size;
    map.set(k, {
      unitKey: k,
      label: String(u.label ?? "").trim() || k,
      baseUnitsEach: Math.max(1, Math.floor(Number(u.baseUnitsEach) || 1)),
      _sort: so,
    });
  }
  let extra = 0;
  for (const u of pharmacySaleUnits) {
    const k = normalizeLabUnitKey(normalizeSaleUnitKey(u.unitKey));
    if (map.has(k)) continue;
    const so =
      typeof u.sortOrder === "number" ? 10_000 + u.sortOrder : 10_000 + extra++;
    map.set(k, {
      unitKey: k,
      label: String(u.label ?? "").trim() || k,
      baseUnitsEach: Math.max(1, Math.floor(Number(u.baseUnitsEach) || 1)),
      _sort: so,
    });
  }
  return [...map.values()]
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...rest }) => rest);
}

function normalizeProductCodeUpper(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Creates missing `LabInventoryUnit` rows on the lab line from the pharmacy product’s sale units
 * so disposable deduction can resolve the same packaging keys.
 */
export async function ensureLabPackagingUnitsFromPharmacyProduct(
  tx: Prisma.TransactionClient,
  args: { branchId: number; productCode: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = normalizeProductCodeUpper(args.productCode);
  const labItem = await tx.labInventoryItem.findFirst({
    where: { branchId: args.branchId, code, isActive: true },
    select: { id: true },
  });
  if (!labItem) {
    return {
      ok: false,
      error: `No lab inventory line with code "${code}" at this branch. Add it under Lab inventory first.`,
    };
  }

  const product = await tx.product.findFirst({
    where: { branchId: args.branchId, code, isActive: true },
    select: {
      saleUnits: {
        orderBy: { sortOrder: "asc" },
        select: { unitKey: true, label: true, baseUnitsEach: true, sortOrder: true },
      },
    },
  });
  if (!product?.saleUnits.length) {
    return { ok: true };
  }

  const existing = await tx.labInventoryUnit.findMany({
    where: { labInventoryItemId: labItem.id },
    select: { unitKey: true },
  });
  const have = new Set(existing.map((e) => normalizeLabUnitKey(e.unitKey)));

  for (const su of product.saleUnits) {
    const k = normalizeLabUnitKey(normalizeSaleUnitKey(su.unitKey));
    if (have.has(k)) continue;
    await tx.labInventoryUnit.create({
      data: {
        labInventoryItemId: labItem.id,
        unitKey: k,
        label: String(su.label ?? "").trim() || k,
        baseUnitsEach: Math.max(1, Math.floor(Number(su.baseUnitsEach) || 1)),
        sortOrder: typeof su.sortOrder === "number" ? su.sortOrder : 0,
      },
    });
    have.add(k);
  }

  return { ok: true };
}
