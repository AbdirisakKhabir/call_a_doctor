import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";
import { getAppointmentBlockMessage } from "@/lib/appointment-schedule-blocks";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";
import { DEFAULT_APPOINTMENT_DURATION_MIN, parseTimeToMinutes } from "@/lib/appointment-calendar-time";
import { runAppointmentCompleteSideEffectsInTx } from "@/lib/appointment-run-complete-side-effects";
import { tryFinalizePendingAppointmentAfterForm } from "@/lib/appointment-completion-workflow";

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
    const { status, startTime, endTime, notes, services, appointmentDate, reminderMinutesBefore, doctorId, branchId } = body;

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
        doctorId: true,
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
      typeof endTime !== "undefined" ||
      (branchId !== undefined && branchId !== null && branchId !== "");

    if (touchesSchedule) {
      const mergedDate =
        typeof appointmentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
          ? appointmentDate
          : formatDateLocal(existingForGuard.appointmentDate);
      const mergedStart = typeof startTime === "string" ? startTime : existingForGuard.startTime;
      const mergedEnd =
        typeof endTime !== "undefined" ? (endTime ? String(endTime) : null) : existingForGuard.endTime;
      const mergedBranchId =
        branchId !== undefined && branchId !== null && branchId !== ""
          ? Number(branchId)
          : existingForGuard.branchId;
      const blockMsg = await getAppointmentBlockMessage(prisma, {
        branchId: mergedBranchId,
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
    if (
      typeof status === "string" &&
      ["scheduled", "pending", "completed", "cancelled", "no-show"].includes(status)
    ) {
      data.status = status;
    }
    if (typeof startTime === "string") data.startTime = startTime;
    if (typeof endTime !== "undefined") data.endTime = endTime ? String(endTime) : null;
    if (doctorId !== undefined && doctorId !== null && doctorId !== "") {
      const d = Number(doctorId);
      if (!Number.isInteger(d) || d <= 0) {
        return NextResponse.json({ error: "Invalid doctor" }, { status: 400 });
      }
      data.doctorId = d;
    }
    if (branchId !== undefined && branchId !== null && branchId !== "") {
      const b = Number(branchId);
      if (!Number.isInteger(b) || b <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      data.branchId = b;
    }
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

    const mergedDoctorId = typeof data.doctorId === "number" ? data.doctorId : existingForGuard.doctorId;
    const mergedDateForOverlap =
      typeof appointmentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)
        ? appointmentDate
        : formatDateLocal(existingForGuard.appointmentDate);
    const mergedStartForOverlap = typeof startTime === "string" ? startTime : existingForGuard.startTime;
    const mergedEndForOverlap =
      typeof endTime !== "undefined" ? (endTime ? String(endTime) : null) : existingForGuard.endTime;
    const startM = parseTimeToMinutes(mergedStartForOverlap);
    const endRaw = mergedEndForOverlap ? parseTimeToMinutes(mergedEndForOverlap) : null;
    if (startM != null) {
      const endM = endRaw != null && endRaw > startM ? endRaw : startM + DEFAULT_APPOINTMENT_DURATION_MIN;
      const [y, mo, d] = mergedDateForOverlap.split("-").map(Number);
      const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0);
      const dayEnd = new Date(y, mo - 1, d, 23, 59, 59, 999);
      const sameDay = await prisma.appointment.findMany({
        where: {
          id: { not: parsedId },
          doctorId: mergedDoctorId,
          appointmentDate: { gte: dayStart, lte: dayEnd },
          status: { not: "cancelled" },
        },
        select: { startTime: true, endTime: true },
      });
      const overlaps = sameDay.some((a) => {
        const sm = parseTimeToMinutes(String(a.startTime));
        const emRaw = a.endTime ? parseTimeToMinutes(String(a.endTime)) : null;
        if (sm == null) return false;
        const em = emRaw != null && emRaw > sm ? emRaw : sm + DEFAULT_APPOINTMENT_DURATION_MIN;
        return startM < em && endM > sm;
      });
      if (overlaps) {
        return NextResponse.json({ error: "This slot is already booked for this doctor." }, { status: 400 });
      }
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
        const fin = await runAppointmentCompleteSideEffectsInTx(tx, {
          appointmentId: parsedId,
          branchId: updated.branchId,
          patientId: updated.patientId,
          userId: auth.userId,
          paymentMethodId: updated.paymentMethodId,
          totalAmount: updated.totalAmount,
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

    let out = appointment;
    if (appointment.status === "pending" && typeof body.paymentMethodId !== "undefined") {
      try {
        await tryFinalizePendingAppointmentAfterForm({ appointmentId: parsedId, userId: auth.userId });
        const refreshed = await prisma.appointment.findUnique({
          where: { id: parsedId },
          include: appointmentInclude,
        });
        if (refreshed) out = refreshed;
      } catch (err) {
        console.error("finalize pending after payment patch:", err);
      }
    }

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.update",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data), balanceDelta, billingSaleId: billingSaleCreatedId },
    });
    return NextResponse.json({ ...out, patient: serializePatient(out.patient) });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith("DISPOSABLE:")) {
      return NextResponse.json({ error: e.message.replace(/^DISPOSABLE:/, "").trim() }, { status: 400 });
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
    const apptSnapshot = await prisma.appointment.findUnique({
      where: { id: parsedId },
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        services: {
          include: { service: { select: { id: true, name: true } } },
        },
      },
    });
    const billingSales =
      apptSnapshot != null
        ? await prisma.sale.findMany({
            where: { appointmentId: parsedId, kind: "appointment" },
            select: { id: true, totalAmount: true },
          })
        : [];
    if (!apptSnapshot) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    await prisma.$transaction(async (tx) => {
      await recordTrashEntry(tx, {
        entityType: "Appointment",
        recordId: parsedId,
        title: `${apptSnapshot.appointmentDate.toISOString().slice(0, 10)} · ${apptSnapshot.patient.patientCode}`,
        detail: `${apptSnapshot.branch.name} · ${apptSnapshot.startTime}`,
        snapshot: toTrashSnapshot(apptSnapshot),
        deletedById: auth.userId,
      });
      for (const s of billingSales) {
        await tx.patient.update({
          where: { id: apptSnapshot.patientId },
          data: { accountBalance: { increment: s.totalAmount } },
        });
        const dep = await tx.accountTransaction.findUnique({ where: { saleId: s.id } });
        if (dep) {
          await tx.accountTransaction.delete({ where: { id: dep.id } });
        }
        await tx.sale.delete({ where: { id: s.id } });
      }
      if (apptSnapshot.totalAmount > 0 && apptSnapshot.postedChargesToPatientOnCreate) {
        await tx.patient.update({
          where: { id: apptSnapshot.patientId },
          data: { accountBalance: { decrement: apptSnapshot.totalAmount } },
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
