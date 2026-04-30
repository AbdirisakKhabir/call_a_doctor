import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";
import { deductDisposablesForCompletedAppointment } from "@/lib/service-disposable-deduction";
import { createAppointmentBillingSaleInTx } from "@/lib/appointment-billing-sale";
import { getAppointmentBlockMessage } from "@/lib/appointment-schedule-blocks";

const appointmentInclude = {
  branch: { select: { id: true, name: true } },
  doctor: { select: { id: true, name: true, specialty: true } },
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, accountBalance: true } },
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const appointment = await prisma.appointment.findUnique({
      where: { id: parsedId },
      include: appointmentInclude,
    });
    if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...appointment, patient: serializePatient(appointment.patient) });
  } catch (e) {
    console.error("GET appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const { status, startTime, endTime, notes, services, appointmentDate, reminderMinutesBefore } = body;

    const billingDiscountRaw = body.billingDiscount;
    const billingDiscount =
      typeof billingDiscountRaw === "number" && Number.isFinite(billingDiscountRaw)
        ? Math.max(0, billingDiscountRaw)
        : typeof billingDiscountRaw === "string" && billingDiscountRaw.trim() !== ""
          ? Math.max(0, Number(billingDiscountRaw) || 0)
          : 0;

    const existingForGuard = await prisma.appointment.findUnique({
      where: { id: parsedId },
      select: {
        status: true,
        branchId: true,
        appointmentDate: true,
        startTime: true,
        endTime: true,
      },
    });
    if (!existingForGuard) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    function formatDateLocal(d: Date): string {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const touchesSchedule =
      (typeof appointmentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) ||
      typeof startTime === "string" ||
      typeof endTime !== "undefined";

    if (touchesSchedule) {
      const mergedDate =
        typeof appointmentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
          ? appointmentDate
          : formatDateLocal(existingForGuard.appointmentDate);
      const mergedStart = typeof startTime === "string" ? startTime : existingForGuard.startTime;
      const mergedEnd =
        typeof endTime !== "undefined" ? (endTime ? String(endTime) : null) : existingForGuard.endTime;
      const blockMsg = await getAppointmentBlockMessage(prisma, {
        branchId: existingForGuard.branchId,
        appointmentDate: mergedDate,
        startTime: mergedStart,
        endTime: mergedEnd,
      });
      if (blockMsg) {
        return NextResponse.json({ error: blockMsg }, { status: 400 });
      }
    }

    if (Array.isArray(services)) {
      const incomingStatus = typeof status === "string" ? status : undefined;
      if (
        existingForGuard.status === "completed" &&
        incomingStatus !== "scheduled" &&
        incomingStatus !== "cancelled"
      ) {
        return NextResponse.json(
          {
            error:
              "Set the appointment to Scheduled or Cancelled before changing service lines on a completed visit.",
          },
          { status: 400 }
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (typeof status === "string" && ["scheduled", "completed", "cancelled", "no-show"].includes(status)) {
      data.status = status;
    }
    if (typeof startTime === "string") data.startTime = startTime;
    if (typeof endTime !== "undefined") data.endTime = endTime ? String(endTime) : null;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() : null;
    if (typeof appointmentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
      data.appointmentDate = new Date(appointmentDate);
    }
    if (reminderMinutesBefore === null || reminderMinutesBefore === "") {
      data.reminderMinutesBefore = null;
    } else if (reminderMinutesBefore !== undefined) {
      const r = Number(reminderMinutesBefore);
      if (Number.isFinite(r) && r > 0 && r <= 10080) data.reminderMinutesBefore = Math.floor(r);
    }

    if (body.paymentMethodId !== undefined) {
      if (body.paymentMethodId === null || body.paymentMethodId === "") {
        data.paymentMethodId = null;
      } else {
        const pm = Number(body.paymentMethodId);
        if (!Number.isInteger(pm) || pm <= 0) {
          return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }
        data.paymentMethodId = pm;
      }
    }

    const hasFieldUpdates = Object.keys(data).length > 0;
    if (!hasFieldUpdates && !Array.isArray(services)) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    let balanceDelta: number | null = null;
    let billingSaleCreatedId: number | null = null;

    const appointment = await prisma.$transaction(async (tx) => {
      if (Array.isArray(services)) {
        const aptWithBilling = await tx.sale.findFirst({
          where: { appointmentId: parsedId, kind: "appointment" },
          select: { id: true },
        });
        if (aptWithBilling) {
          throw new Error("SERVICES_LOCKED_BILLING");
        }
        const existing = await tx.appointment.findUnique({
          where: { id: parsedId },
          select: { totalAmount: true, patientId: true },
        });
        if (!existing) {
          throw new Error("NOT_FOUND");
        }
        await tx.appointmentService.deleteMany({ where: { appointmentId: parsedId } });
        let newTotal = 0;
        const appointmentServices: { serviceId: number; quantity: number; unitPrice: number; totalAmount: number }[] =
          [];
        for (const s of services) {
          const serviceId = Number(s.serviceId);
          const quantity = Math.max(1, Math.floor(Number(s.quantity) || 1));
          const unitPrice = Math.max(0, Number(s.unitPrice) || 0);
          const lineTotal = quantity * unitPrice;
          if (Number.isInteger(serviceId) && serviceId > 0) {
            appointmentServices.push({ serviceId, quantity, unitPrice, totalAmount: lineTotal });
            newTotal += lineTotal;
          }
        }
        if (appointmentServices.length > 0) {
          await tx.appointmentService.createMany({
            data: appointmentServices.map((s) => ({
              appointmentId: parsedId,
              serviceId: s.serviceId,
              quantity: s.quantity,
              unitPrice: s.unitPrice,
              totalAmount: s.totalAmount,
            })),
          });
          data.totalAmount = appointmentServices.reduce((s, x) => s + x.totalAmount, 0);
        } else {
          data.totalAmount = 0;
        }
        balanceDelta = Number(data.totalAmount) - existing.totalAmount;
        if (balanceDelta !== 0) {
          await tx.patient.update({
            where: { id: existing.patientId },
            data: { accountBalance: { increment: balanceDelta } },
          });
        }
      }

      const updated = await tx.appointment.update({
        where: { id: parsedId },
        data,
      });

      if (updated.status === "completed") {
        const ded = await deductDisposablesForCompletedAppointment(tx, {
          appointmentId: parsedId,
          branchId: updated.branchId,
          userId: auth.userId,
        });
        if (!ded.ok) {
          throw new Error(`DISPOSABLE:${ded.error}`);
        }

        if (updated.totalAmount > 0) {
          const pmId = updated.paymentMethodId;
          if (!pmId) {
            throw new Error("PAYMENT_METHOD_REQUIRED");
          }
          const lines = await tx.appointmentService.findMany({
            where: { appointmentId: parsedId },
            select: { serviceId: true, quantity: true, unitPrice: true, totalAmount: true },
          });
          const bill = await createAppointmentBillingSaleInTx(tx, {
            appointmentId: parsedId,
            branchId: updated.branchId,
            patientId: updated.patientId,
            userId: auth.userId,
            paymentMethodId: pmId,
            discount: billingDiscount,
            lines,
          });
          if (bill.created === false && bill.reason === "no_lines") {
            throw new Error("BILLING_NO_LINES");
          }
          if (bill.created) {
            billingSaleCreatedId = bill.saleId;
          }
        }
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
      action: "appointment.update",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data), balanceDelta, billingSaleId: billingSaleCreatedId },
    });
    return NextResponse.json({ ...appointment, patient: serializePatient(appointment.patient) });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith("DISPOSABLE:")) {
      return NextResponse.json({ error: e.message.replace(/^DISPOSABLE:/, "").trim() }, { status: 400 });
    }
    if (e instanceof Error && e.message === "PAYMENT_METHOD_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "This visit has a balance due. Choose a payment method (or save one on the booking first), then mark it completed again.",
        },
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
    if (e instanceof Error && e.message === "BILLING_NO_LINES") {
      return NextResponse.json(
        { error: "Add at least one service line before completing a billed visit." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "SERVICES_LOCKED_BILLING") {
      return NextResponse.json(
        {
          error:
            "Visit billing has already been posted for this booking. You cannot change service lines unless an administrator removes or adjusts the linked sale.",
        },
        { status: 400 }
      );
    }
    console.error("Update appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.appointment.findUnique({
      where: { id: parsedId },
      select: {
        patientId: true,
        totalAmount: true,
        postedChargesToPatientOnCreate: true,
      },
    });
    const billingSales =
      existing != null
        ? await prisma.sale.findMany({
            where: { appointmentId: parsedId, kind: "appointment" },
            select: { id: true, totalAmount: true },
          })
        : [];
    if (!existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    await prisma.$transaction(async (tx) => {
      for (const s of billingSales) {
        await tx.patient.update({
          where: { id: existing.patientId },
          data: { accountBalance: { increment: s.totalAmount } },
        });
        const dep = await tx.accountTransaction.findUnique({ where: { saleId: s.id } });
        if (dep) {
          await tx.accountTransaction.delete({ where: { id: dep.id } });
        }
        await tx.sale.delete({ where: { id: s.id } });
      }
      if (existing.totalAmount > 0 && existing.postedChargesToPatientOnCreate) {
        await tx.patient.update({
          where: { id: existing.patientId },
          data: { accountBalance: { decrement: existing.totalAmount } },
        });
      }
      await tx.appointment.delete({ where: { id: parsedId } });
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.delete",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: parsedId,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
