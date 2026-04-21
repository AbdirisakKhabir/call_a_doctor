import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deductDisposablesForLabOrderItem } from "@/lib/lab-disposable-deduction";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, itemId } = await params;
    const parsedId = Number(id);
    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedId) || !Number.isInteger(parsedItemId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const { resultValue, resultUnit, status, notes } = body;

    const item = await prisma.labOrderItem.findFirst({
      where: { id: parsedItemId, labOrderId: parsedId },
      include: {
        labOrder: {
          select: {
            id: true,
            totalAmount: true,
            labFeePaidAmount: true,
            labFeeDiscountAmount: true,
            appointment: { select: { branchId: true } },
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (typeof resultValue !== "undefined") data.resultValue = resultValue ? String(resultValue) : null;
    if (typeof resultUnit !== "undefined") data.resultUnit = resultUnit ? String(resultUnit) : null;
    if (typeof status === "string" && (status === "pending" || status === "completed")) data.status = status;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes) : null;
    if (
      typeof status === "string" &&
      status === "completed" &&
      ((typeof resultValue === "string" && resultValue) || (typeof resultUnit === "string" && resultUnit))
    ) {
      data.recordedById = auth.userId;
      data.recordedAt = new Date();
    }

    const nextStatus =
      typeof status === "string" && (status === "pending" || status === "completed") ? status : item.status;

    const shouldDeduct = nextStatus === "completed" && !item.disposablesDeductedAt;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.labOrderItem.update({
        where: { id: parsedItemId },
        data,
        include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true } } },
      });

      if (shouldDeduct) {
        const branchId = item.labOrder.appointment.branchId;
        const res = await deductDisposablesForLabOrderItem(tx, {
          labOrderItemId: parsedItemId,
          labOrderId: parsedId,
          labTestId: item.labTestId,
          appointmentBranchId: branchId,
          userId: auth.userId,
        });
        if (!res.ok) {
          throw new Error(`DISPOSABLE:${res.error}`); // rolls back item update
        }
      }

      return row;
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("DISPOSABLE:")) {
      return NextResponse.json({ error: e.message.replace(/^DISPOSABLE:/, "") }, { status: 400 });
    }
    console.error("Update lab result error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
