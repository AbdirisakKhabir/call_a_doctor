import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import {
  countClinicFormsForAppointment,
  needsClinicFormRecorded,
  parseCompletionTristate,
} from "@/lib/appointment-completion-workflow";
import { runAppointmentCompleteSideEffectsInTx } from "@/lib/appointment-run-complete-side-effects";

const appointmentInclude = {
  branch: { select: { id: true, name: true } },
  doctor: { select: { id: true, name: true, specialty: true } },
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      accountBalance: true,
    },
  },
  paymentMethod: { select: { id: true, name: true } },
  careFile: { select: { id: true, fileCode: true, status: true } },
  services: { include: { service: { select: { id: true, name: true, color: true } } } },
  sales: {
    select: {
      id: true,
      saleDate: true,
      totalAmount: true,
      discount: true,
      paymentMethod: true,
      kind: true,
      depositTransaction: { select: { id: true } },
    },
    orderBy: { saleDate: "desc" as const },
  },
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const lab = parseCompletionTristate(body.lab);
    const prescription = parseCompletionTristate(body.prescription);
    const clinicNote = parseCompletionTristate(body.clinicNote);
    if (lab == null || prescription == null || clinicNote == null) {
      return NextResponse.json(
        { error: "Lab, prescription, and clinic note must each be yes, no, or na" },
        { status: 400 }
      );
    }

    const billingDiscountRaw = body.billingDiscount;
    const billingDiscount =
      typeof billingDiscountRaw === "number" && Number.isFinite(billingDiscountRaw)
        ? Math.max(0, billingDiscountRaw)
        : typeof billingDiscountRaw === "string" && billingDiscountRaw.trim() !== ""
          ? Math.max(0, Number(billingDiscountRaw) || 0)
          : 0;

    let billingSaleCreatedId: number | null = null;

    const appointment = await prisma.$transaction(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id: parsedId },
        select: {
          status: true,
          branchId: true,
          patientId: true,
          totalAmount: true,
          paymentMethodId: true,
        },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }
      if (!["scheduled", "pending"].includes(existing.status)) {
        throw new Error("INVALID_STATUS");
      }

      const formCount = await countClinicFormsForAppointment(tx, parsedId);
      const needsForm = needsClinicFormRecorded(lab, prescription, clinicNote);
      const nextStatus = needsForm && formCount < 1 ? "pending" : "completed";

      await tx.appointment.update({
        where: { id: parsedId },
        data: {
          completionChecklistLab: lab,
          completionChecklistPrescription: prescription,
          completionChecklistClinicNote: clinicNote,
          status: nextStatus,
        },
      });

      if (nextStatus === "completed") {
        const after = await tx.appointment.findUnique({
          where: { id: parsedId },
          select: {
            branchId: true,
            patientId: true,
            paymentMethodId: true,
            totalAmount: true,
          },
        });
        if (!after) throw new Error("NOT_FOUND");
        const fin = await runAppointmentCompleteSideEffectsInTx(tx, {
          appointmentId: parsedId,
          branchId: after.branchId,
          patientId: after.patientId,
          userId: auth.userId,
          paymentMethodId: after.paymentMethodId,
          totalAmount: after.totalAmount,
          billingDiscount,
        });
        billingSaleCreatedId = fin.billingSaleCreatedId;
      }

      const full = await tx.appointment.findUnique({
        where: { id: parsedId },
        include: appointmentInclude,
      });
      if (!full) throw new Error("NOT_FOUND");
      return full;
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.complete_workflow",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: parsedId,
      metadata: { status: appointment.status, billingSaleId: billingSaleCreatedId },
    });

    return NextResponse.json({ ...appointment, patient: serializePatient(appointment.patient) });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "INVALID_STATUS") {
      return NextResponse.json(
        { error: "Only scheduled or pending bookings can use this workflow." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message.startsWith("DISPOSABLE:")) {
      return NextResponse.json({ error: e.message.replace(/^DISPOSABLE:/, "").trim() }, { status: 400 });
    }
    if (e instanceof Error && e.message === "BILLING_NO_LINES") {
      return NextResponse.json(
        { error: "Add at least one service line before completing a billed visit." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "INVALID_PAYMENT_METHOD") {
      return NextResponse.json(
        {
          error:
            "Invalid payment method. Choose an active method linked to a finance account (Settings → Payment methods).",
        },
        { status: 400 }
      );
    }
    console.error("complete-visit-workflow error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
