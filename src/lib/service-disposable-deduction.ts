import type { Prisma } from "@prisma/client";
import { labUnitsToBaseQuantity } from "@/lib/lab-inventory-units";
import { normalizeSaleUnitKey, getSaleUnitForProduct } from "@/lib/product-sale-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

const PURPOSE = "service_disposable";

/**
 * When an appointment is marked completed, deduct configured pharmacy products per service line
 * (branch = appointment branch). Idempotent via AppointmentService.disposablesDeductedAt.
 */
export async function deductDisposablesForCompletedAppointment(
  tx: Prisma.TransactionClient,
  args: { appointmentId: number; branchId: number; userId: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lines = await tx.appointmentService.findMany({
    where: { appointmentId: args.appointmentId, disposablesDeductedAt: null },
    include: {
      service: {
        include: {
          disposables: { orderBy: { productCode: "asc" } },
        },
      },
    },
  });

  for (const line of lines) {
    const qty = Math.max(1, line.quantity);
    const defs = line.service.disposables;

    if (defs.length === 0) {
      await tx.appointmentService.update({
        where: { id: line.id },
        data: { disposablesDeductedAt: new Date() },
      });
      continue;
    }

    const planned: {
      productId: number;
      deduct: number;
      code: string;
      name: string;
      unitLabel: string;
    }[] = [];

    for (const d of defs) {
      const code = normalizeProductCode(d.productCode);
      const product = await tx.product.findFirst({
        where: { branchId: args.branchId, code, isActive: true },
        select: { id: true, quantity: true, unit: true, name: true },
      });
      if (!product) {
        return {
          ok: false,
          error: `No pharmacy product with code "${code}" at this branch. Add it under Pharmacy inventory (same code as in service disposables) or remove this disposable from the service.`,
        };
      }

      const unitRow = await getSaleUnitForProduct(tx, product.id, d.deductionUnitKey);
      if (!unitRow) {
        return {
          ok: false,
          error: `Product "${product.name}" (${code}) has no sale/packaging unit "${normalizeSaleUnitKey(d.deductionUnitKey)}". Configure Product sale units or change the disposable unit key.`,
        };
      }

      const deduct = labUnitsToBaseQuantity(d.unitsPerService * qty, unitRow.baseUnitsEach);
      if (deduct <= 0) continue;

      if (product.quantity < deduct) {
        return {
          ok: false,
          error: `Insufficient pharmacy stock for ${product.name} (${code}): need ${deduct} base units for this service line, on hand ${product.quantity} (${product.unit || "base"}).`,
        };
      }

      planned.push({
        productId: product.id,
        deduct,
        code,
        name: product.name,
        unitLabel: `${unitRow.label}→${product.unit || "base"}`,
      });
    }

    if (planned.length === 0) {
      await tx.appointmentService.update({
        where: { id: line.id },
        data: { disposablesDeductedAt: new Date() },
      });
      continue;
    }

    for (const p of planned) {
      await tx.product.update({
        where: { id: p.productId },
        data: { quantity: { decrement: p.deduct } },
      });
      await tx.internalStockLog.create({
        data: {
          productId: p.productId,
          branchId: args.branchId,
          quantity: p.deduct,
          purpose: PURPOSE,
          relatedAppointmentId: args.appointmentId,
          notes: `Service disposable · Appt #${args.appointmentId} · line #${line.id} · ${p.code} (−${p.deduct} ${p.unitLabel})`,
          createdById: args.userId,
        },
      });
    }

    await tx.appointmentService.update({
      where: { id: line.id },
      data: { disposablesDeductedAt: new Date() },
    });
  }

  return { ok: true };
}
