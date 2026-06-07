import type { Prisma } from "@prisma/client";
import { labUnitsToBaseQuantity, normalizeLabUnitKey } from "@/lib/lab-inventory-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * When a lab order item is marked completed, deduct configured disposables from lab inventory at the appointment branch.
 */
export async function deductDisposablesForLabOrderItem(
  tx: Prisma.TransactionClient,
  args: {
    labOrderItemId: number;
    labOrderId: number;
    labTestId: number;
    appointmentBranchId: number;
    userId: number;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await tx.labTestDisposable.findMany({
    where: { labTestId: args.labTestId },
  });
  const branchId = args.appointmentBranchId;
  const notesBase = `Lab disposable · Order #${args.labOrderId} · item #${args.labOrderItemId}`;

  if (rows.length === 0) {
    await tx.labOrderItem.update({
      where: { id: args.labOrderItemId },
      data: { disposablesDeductedAt: new Date() },
    });
    return { ok: true };
  }

  const planned: {
    labInventoryItemId: number;
    deduct: number;
    unitLabel: string;
    productCode: string;
  }[] = [];

  for (const row of rows) {
    const code = normalizeProductCode(row.productCode);
    const unitKey = normalizeLabUnitKey(row.deductionUnitKey);

    const item = await tx.labInventoryItem.findFirst({
      where: { branchId, code, isActive: true },
      select: {
        id: true,
        quantity: true,
        unit: true,
        name: true,
      },
    });
    if (!item) {
      return {
        ok: false,
        error: `No lab inventory with code "${code}" at this branch. Add it under Laboratory → Lab inventory (same code as in test disposables) or remove this disposable from the test.`,
      };
    }

    const unitRow = await tx.labInventoryUnit.findUnique({
      where: {
        labInventoryItemId_unitKey: { labInventoryItemId: item.id, unitKey },
      },
      select: { baseUnitsEach: true, label: true },
    });
    if (!unitRow) {
      return {
        ok: false,
        error: `Lab inventory "${item.name}" (${code}) has no unit "${unitKey}". Add it under Laboratory → Lab inventory → packaging units, or change the disposable deduction unit.`,
      };
    }

    const deduct = labUnitsToBaseQuantity(row.unitsPerTest, unitRow.baseUnitsEach);
    if (deduct <= 0) continue;

    if (item.quantity < deduct) {
      return {
        ok: false,
        error: `Insufficient lab stock for ${item.name} (${code}): need ${deduct} base units (${row.unitsPerTest} × ${unitRow.label}), on hand ${item.quantity} (${item.unit || "base"}).`,
      };
    }
    planned.push({
      productCode: code,
      labInventoryItemId: item.id,
      deduct,
      unitLabel: `${unitRow.label}→${item.unit || "base"}`,
    });
  }

  if (planned.length === 0) {
    await tx.labOrderItem.update({
      where: { id: args.labOrderItemId },
      data: { disposablesDeductedAt: new Date() },
    });
    return { ok: true };
  }

  for (const p of planned) {
    await tx.labInventoryItem.update({
      where: { id: p.labInventoryItemId },
      data: { quantity: { decrement: p.deduct } },
    });
    await tx.labStockMovement.create({
      data: {
        labInventoryItemId: p.labInventoryItemId,
        branchId,
        signedQuantity: -p.deduct,
        reason: "disposable",
        labOrderItemId: args.labOrderItemId,
        notes: `${notesBase} · ${p.productCode} (−${p.deduct} ${p.unitLabel})`,
        createdById: args.userId,
      },
    });
  }

  await tx.labOrderItem.update({
    where: { id: args.labOrderItemId },
    data: { disposablesDeductedAt: new Date() },
  });

  return { ok: true };
}
