import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const appointmentId = searchParams.get("appointmentId");
    const branchIdParam = searchParams.get("branchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    /** all | yes | no — filter emergency vs clinic (scheduled visit) prescriptions */
    const emergency = searchParams.get("emergency");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasApptDateFilter = Object.keys(dateFilter).length > 0;
    const branchId = branchIdParam ? Number(branchIdParam) : NaN;
    const branchFilter =
      Number.isInteger(branchId) && branchId > 0 ? { branchId } : undefined;

    const appointmentWhere: {
      branchId?: number;
      appointmentDate?: { gte?: Date; lte?: Date };
    } = {};
    if (branchFilter) appointmentWhere.branchId = branchFilter.branchId;
    if (hasApptDateFilter) appointmentWhere.appointmentDate = dateFilter;
    const hasAppointmentWhere = Object.keys(appointmentWhere).length > 0;

    const emergencyWhere =
      emergency === "yes" ? { isEmergency: true } : emergency === "no" ? { isEmergency: false } : {};

    const where = {
      ...(patientId ? { patientId: Number(patientId) } : {}),
      ...(appointmentId ? { appointmentId: Number(appointmentId) } : {}),
      ...(hasAppointmentWhere ? { appointment: appointmentWhere } : {}),
      ...emergencyWhere,
    };

    const include = {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
      appointment: {
        select: {
          id: true,
          appointmentDate: true,
          startTime: true,
          branch: { select: { id: true, name: true } },
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              code: true,
              quantity: true,
              sellingPrice: true,
            },
          },
        },
      },
    };

    if (paginate) {
      const [prescriptions, total] = await Promise.all([
        prisma.prescription.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.prescription.count({ where }),
      ]);
      return NextResponse.json({
        data: prescriptions.map((rx) => ({ ...rx, patient: serializePatient(rx.patient) })),
        total,
        page,
        pageSize,
      });
    }

    const prescriptions = await prisma.prescription.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(prescriptions.map((rx) => ({ ...rx, patient: serializePatient(rx.patient) })));
  } catch (e) {
    console.error("Prescriptions error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { appointmentId, patientId, doctorId, notes, items, isEmergency } = body;
    if (!appointmentId || !patientId || !doctorId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Appointment, client, doctor and at least one item are required" }, { status: 400 });
    }

    const appt = await prisma.appointment.findUnique({
      where: { id: Number(appointmentId) },
      select: { branchId: true, careFileId: true },
    });
    if (!appt) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 400 });
    }

    for (const i of items as { productId: number }[]) {
      const pid = Number(i.productId);
      if (!Number.isInteger(pid)) continue;
      const prod = await prisma.product.findUnique({
        where: { id: pid },
        select: { forSale: true, name: true, branchId: true },
      });
      if (prod && prod.branchId !== appt.branchId) {
        return NextResponse.json(
          {
            error: `Product "${prod.name}" is not in stock at this appointment’s branch. Choose items from that branch’s retail inventory.`,
          },
          { status: 400 }
        );
      }
      if (prod && !prod.forSale) {
        return NextResponse.json(
          { error: `Product "${prod.name}" is internal supplies and cannot be prescribed. Use retail items only.` },
          { status: 400 }
        );
      }
    }

    const prescription = await prisma.prescription.create({
      data: {
        appointmentId: Number(appointmentId),
        patientId: Number(patientId),
        doctorId: Number(doctorId),
        createdById: auth.userId,
        isEmergency: Boolean(isEmergency),
        notes: notes ? String(notes).trim() : null,
        careFileId: appt.careFileId,
        items: {
          create: items.map((i: { productId: number; quantity: number; dosage?: string; instructions?: string }) => ({
            productId: Number(i.productId),
            quantity: Math.max(1, Number(i.quantity) || 1),
            dosage: i.dosage ? String(i.dosage).trim() : null,
            instructions: i.instructions ? String(i.instructions).trim() : null,
          })),
        },
      },
      include: {
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
        items: { include: { product: { select: { id: true, name: true, code: true } } } },
      },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "prescription.create",
      module: "prescriptions",
      resourceType: "Prescription",
      resourceId: prescription.id,
      metadata: { patientId: prescription.patientId, appointmentId: prescription.appointmentId },
    });
    return NextResponse.json({ ...prescription, patient: serializePatient(prescription.patient) });
  } catch (e) {
    console.error("Create prescription error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
