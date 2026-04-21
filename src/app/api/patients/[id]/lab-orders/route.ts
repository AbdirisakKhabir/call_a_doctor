import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLabOrderFeeSettled, labOrderFeeRemaining } from "@/lib/lab-fee-settlement";

/**
 * List lab orders for a client (optional: only orders with an outstanding lab fee).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const pendingFeeOnly = searchParams.get("pendingFee") === "1";

    const orders = await prisma.labOrder.findMany({
      where: { patientId, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        totalAmount: true,
        labFeePaidAmount: true,
        labFeeDiscountAmount: true,
        status: true,
        createdAt: true,
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      },
    });

    const mapped = orders.map((o) => {
      const feeRemaining = labOrderFeeRemaining(o);
      const feeSettled = isLabOrderFeeSettled(o);
      return {
        ...o,
        feeRemaining,
        feeSettled,
      };
    });

    const data = pendingFeeOnly
      ? mapped.filter((o) => !o.feeSettled && o.totalAmount > 0.01)
      : mapped;

    return NextResponse.json(data);
  } catch (e) {
    console.error("Patient lab orders list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
