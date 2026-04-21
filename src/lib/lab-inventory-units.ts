import type { Prisma } from "@prisma/client";

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
