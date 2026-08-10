import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import { loadActivePaymentGroup, reversePatientPaymentGroup } from "@/lib/patient-payment-reverse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canCancel =
      (await userHasPermission(auth.userId, "accounts.deposit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos"));
    if (!canCancel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadActivePaymentGroup(tx, paymentId);
      if (loaded.kind === "not_found") throw new Error("NOT_FOUND");
      if (loaded.kind === "already_cancelled") throw new Error("CONFLICT:CONCURRENT");

      const { group, patientId, patientCode } = loaded;
      const idsLabel = group.map((g) => g.id).join(", #");

      const { restore, cash } = await reversePatientPaymentGroup(tx, {
        group,
        patientId,
        patientCode,
        userId: auth.userId,
        withdrawalDescription: `Cancel client payment — ${patientCode} (#${idsLabel})`,
      });

      const now = new Date();
      await tx.patientPayment.updateMany({
        where: { id: { in: group.map((g) => g.id) } },
        data: { cancelledAt: now, cancelledById: auth.userId },
      });

      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, firstName: true, lastName: true },
      });

      return {
        patient,
        cancelledIds: group.map((g) => g.id),
        restoredToBalance: restore,
        reversedDeposit: cash > 0.02,
      };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient_payment.cancel",
      module: "payments",
      resourceType: "PatientPayment",
      resourceId: paymentId,
      metadata: {
        patientId: result.patient?.id,
        cancelledIds: result.cancelledIds,
        restoredToBalance: result.restoredToBalance,
        reversedDeposit: result.reversedDeposit,
      },
    });

    return NextResponse.json({
      ok: true,
      cancelledIds: result.cancelledIds,
      restoredToBalance: result.restoredToBalance,
      patient: result.patient ? serializePatient(result.patient) : null,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith("BAD_REQUEST:")) {
        return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "") }, { status: 400 });
      }
      if (e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }
      if (e.message === "CONFLICT:CONCURRENT") {
        return NextResponse.json({ error: "This payment was already cancelled" }, { status: 409 });
      }
    }
    console.error("Cancel patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
