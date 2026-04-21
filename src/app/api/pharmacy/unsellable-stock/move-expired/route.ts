import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";

/**
 * Move all sellable stock for products whose expiry date is before today
 * (local calendar day, start of day) into unsellable stock. One log line per product.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "pharmacy.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const branchId = Number(body.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, branchId))) {
      return NextResponse.json({ error: "You are not allowed to adjust inventory for this branch" }, { status: 403 });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const candidates = await prisma.product.findMany({
      where: {
        branchId,
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: { not: null, lt: startOfToday },
      },
      select: { id: true, quantity: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        movedProducts: 0,
        totalBaseUnits: 0,
        message: "No expired sellable stock found for this branch.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      let totalBaseUnits = 0;
      const logIds: number[] = [];
      for (const p of candidates) {
        const q = p.quantity;
        totalBaseUnits += q;
        await tx.product.update({
          where: { id: p.id },
          data: {
            quantity: { decrement: q },
            unsellableQuantity: { increment: q },
          },
        });
        const row = await tx.unsellableStockLog.create({
          data: {
            productId: p.id,
            branchId,
            quantity: q,
            reason: "expired",
            notes: "Moved automatically: expiry date before today.",
            createdById: auth.userId,
          },
        });
        logIds.push(row.id);
      }
      return { totalBaseUnits, logIds };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.unsellable_stock.move_expired",
      module: "pharmacy",
      resourceType: "UnsellableStockLog",
      resourceId: result.logIds[0] ?? null,
      metadata: {
        branchId,
        movedProducts: candidates.length,
        totalBaseUnits: result.totalBaseUnits,
      },
    });

    return NextResponse.json({
      movedProducts: candidates.length,
      totalBaseUnits: result.totalBaseUnits,
    });
  } catch (e) {
    console.error("Move expired unsellable error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
