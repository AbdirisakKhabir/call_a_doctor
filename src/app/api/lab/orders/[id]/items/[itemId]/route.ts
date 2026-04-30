import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { deductDisposablesForLabOrderItem } from "@/lib/lab-disposable-deduction";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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
            status: true,
            totalAmount: true,
            labFeePaidAmount: true,
            labFeeDiscountAmount: true,
            appointment: { select: { branchId: true } },
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.labOrder.status === "cancelled") {
      return NextResponse.json({ error: "Cannot update results on a cancelled order" }, { status: 400 });
    }

    const toNullableString = (v: unknown): string | null => {
      if (v === null || v === undefined || v === "") return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };

    const nextValue =
      typeof resultValue !== "undefined" ? toNullableString(resultValue) : item.resultValue;
    const nextUnit =
      typeof resultUnit !== "undefined" ? toNullableString(resultUnit) : item.resultUnit;

    const hasResult = Boolean((nextValue ?? "").trim() || (nextUnit ?? "").trim());

    let nextLineStatus: "pending" | "completed";
    if (typeof status === "string" && (status === "pending" || status === "completed")) {
      nextLineStatus = status;
    } else if (item.status === "completed") {
      nextLineStatus = "completed";
    } else {
      nextLineStatus = "pending";
    }

    if (!hasResult) nextLineStatus = "pending";
    else if (
      hasResult &&
      nextLineStatus === "pending" &&
      typeof status === "undefined" &&
      (typeof resultValue !== "undefined" || typeof resultUnit !== "undefined")
    ) {
      nextLineStatus = "completed";
    }

    const data: Record<string, unknown> = {};
    if (typeof resultValue !== "undefined") data.resultValue = nextValue;
    if (typeof resultUnit !== "undefined") data.resultUnit = nextUnit;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() || null : null;

    data.status = nextLineStatus;

    const touchesResultOrStatus =
      typeof resultValue !== "undefined" ||
      typeof resultUnit !== "undefined" ||
      typeof status !== "undefined";

    if (touchesResultOrStatus) {
      if (nextLineStatus === "completed" && hasResult) {
        data.recordedById = auth.userId;
        data.recordedAt = new Date();
      } else {
        data.recordedById = null;
        data.recordedAt = null;
      }
    }

    const shouldDeduct =
      nextLineStatus === "completed" && hasResult && !item.disposablesDeductedAt;

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

      const pendingLines = await tx.labOrderItem.count({
        where: { labOrderId: parsedId, NOT: { status: "completed" } },
      });
      await tx.labOrder.updateMany({
        where: { id: parsedId, NOT: { status: "cancelled" } },
        data: { status: pendingLines === 0 ? "completed" : "pending" },
      });

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
