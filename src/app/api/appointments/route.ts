import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import {
  assertOpenCareFileForPatient,
  closeOpenCareFilesAndCreateNew,
  ensureOpenCareFile,
} from "@/lib/care-file";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (branchId) where.branchId = Number(branchId);
    if (startDate && endDate) {
      where.appointmentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        services: {
          include: { service: { select: { id: true, name: true, color: true } } },
        },
      },
      orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json(
      appointments.map((a) => ({ ...a, patient: serializePatient(a.patient) }))
    );
  } catch (e) {
    console.error("Appointments list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const {
      branchId,
      doctorId,
      patientId,
      appointmentDate,
      startTime,
      endTime,
      notes,
      services,
      reminderMinutesBefore,
      careFileId: bodyCareFileId,
      startNewCareFile,
    } = body;

    if (!branchId || !doctorId || !patientId || !appointmentDate || !startTime) {
      return NextResponse.json({ error: "Branch, doctor, client, date and start time are required" }, { status: 400 });
    }

    let totalAmount = 0;
    const appointmentServices: { serviceId: number; quantity: number; unitPrice: number; totalAmount: number }[] = [];

    if (Array.isArray(services) && services.length > 0) {
      for (const s of services) {
        const serviceId = Number(s.serviceId);
        const quantity = Math.max(1, Math.floor(Number(s.quantity) || 1));
        const unitPrice = Math.max(0, Number(s.unitPrice) || 0);
        const lineTotal = quantity * unitPrice;
        if (Number.isInteger(serviceId) && serviceId > 0) {
          appointmentServices.push({ serviceId, quantity, unitPrice, totalAmount: lineTotal });
          totalAmount += lineTotal;
        }
      }
    }

    const patientIdNum = Number(patientId);
    let reminder: number | null = null;
    if (reminderMinutesBefore != null && reminderMinutesBefore !== "") {
      const r = Number(reminderMinutesBefore);
      if (Number.isFinite(r) && r > 0 && r <= 10080) reminder = Math.floor(r);
    }

    const appointment = await prisma.$transaction(async (tx) => {
      let resolvedCareFileId: number | null = null;
      if (startNewCareFile === true) {
        const nf = await closeOpenCareFilesAndCreateNew(tx, patientIdNum, null);
        resolvedCareFileId = nf.id;
      } else if (bodyCareFileId != null && bodyCareFileId !== "") {
        const cf = await assertOpenCareFileForPatient(tx, patientIdNum, Number(bodyCareFileId));
        resolvedCareFileId = cf.id;
      } else {
        const ensured = await ensureOpenCareFile(tx, patientIdNum);
        resolvedCareFileId = ensured.id;
      }

      const apt = await tx.appointment.create({
        data: {
          branchId: Number(branchId),
          doctorId: Number(doctorId),
          patientId: patientIdNum,
          appointmentDate: new Date(appointmentDate),
          startTime: String(startTime),
          endTime: endTime ? String(endTime) : null,
          notes: notes ? String(notes).trim() : null,
          reminderMinutesBefore: reminder,
          totalAmount,
          status: "scheduled",
          createdById: auth.userId,
          careFileId: resolvedCareFileId,
          services: appointmentServices.length
            ? { create: appointmentServices }
            : undefined,
        },
      });
      if (totalAmount > 0) {
        await tx.patient.update({
          where: { id: patientIdNum },
          data: { accountBalance: { increment: totalAmount } },
        });
      }
      return tx.appointment.findUnique({
        where: { id: apt.id },
        include: {
          branch: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
          patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, accountBalance: true } },
          careFile: { select: { id: true, fileCode: true, status: true } },
          services: { include: { service: { select: { id: true, name: true, color: true } } } },
        },
      });
    });
    if (!appointment) {
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.create",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: appointment.id,
      metadata: {
        branchId: appointment.branchId,
        patientId: appointment.patientId,
        totalAmount,
        patientCharged: totalAmount > 0,
      },
    });
    return NextResponse.json({ ...appointment, patient: serializePatient(appointment.patient) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    console.error("Create appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
