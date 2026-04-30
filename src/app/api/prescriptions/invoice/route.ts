import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildClientInvoicePayload } from "@/lib/client-invoice-build";

/** @deprecated Use types from @/lib/client-invoice-build */
export type ConsolidatedInvoiceLine = import("@/lib/client-invoice-build").ClientInvoiceLine;

/**
 * Legacy: consolidated invoice from prescriptions only.
 * Prefer POST /api/finance/client-invoice/build for mixed billing.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const idsRaw = body.prescriptionIds;
    const includeVisitServiceFees = body.includeVisitServiceFees === true;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json({ error: "Select at least one prescription." }, { status: 400 });
    }

    const prescriptionIds = [...new Set(idsRaw.map((x: unknown) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
    if (prescriptionIds.length === 0) {
      return NextResponse.json({ error: "Invalid prescription ids." }, { status: 400 });
    }

    const first = await prisma.prescription.findFirst({
      where: { id: prescriptionIds[0] },
      select: {
        patientId: true,
        appointment: { select: { branchId: true } },
      },
    });
    if (!first) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 400 });
    }

    const patientId = first.patientId;
    const branchId = first.appointment.branchId;

    const result = await buildClientInvoicePayload({
      userId: auth.userId,
      patientId,
      branchId,
      prescriptionIds,
      labOrderIds: [],
      appointmentIds: [],
      includeVisitServiceFeesFromPrescriptions: includeVisitServiceFees,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.payload);
  } catch (e) {
    console.error("Consolidated invoice error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
