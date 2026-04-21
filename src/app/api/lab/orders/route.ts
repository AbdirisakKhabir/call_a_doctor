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
    const status = searchParams.get("status");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = {
      ...(patientId ? { patientId: Number(patientId) } : {}),
      ...(appointmentId ? { appointmentId: Number(appointmentId) } : {}),
      ...(status ? { status } : {}),
    };
    const include = {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
      appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      items: {
        include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true, price: true } } },
      },
    };

    if (paginate) {
      const [orders, total] = await Promise.all([
        prisma.labOrder.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.labOrder.count({ where }),
      ]);
      return NextResponse.json({
        data: orders.map((o) => ({ ...o, patient: serializePatient(o.patient) })),
        total,
        page,
        pageSize,
      });
    }

    const orders = await prisma.labOrder.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(orders.map((o) => ({ ...o, patient: serializePatient(o.patient) })));
  } catch (e) {
    console.error("Lab orders error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { appointmentId, patientId, doctorId, notes, testIds } = body;
    if (!appointmentId || !patientId || !doctorId || !Array.isArray(testIds) || testIds.length === 0) {
      return NextResponse.json({ error: "Appointment, client, doctor and at least one test are required" }, { status: 400 });
    }

    const uniqueTestIds = [
      ...new Set(
        testIds
          .map((x: unknown) => Number(x))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      ),
    ];
    if (uniqueTestIds.length === 0) {
      return NextResponse.json({ error: "At least one valid test is required" }, { status: 400 });
    }

    const labTests = await prisma.labTest.findMany({
      where: { id: { in: uniqueTestIds }, isActive: true },
    });
    if (labTests.length !== uniqueTestIds.length) {
      return NextResponse.json(
        { error: "One or more tests are invalid, inactive, or duplicated incorrectly" },
        { status: 400 }
      );
    }

    const testById = new Map(labTests.map((t) => [t.id, t] as const));
    const totalAmount = uniqueTestIds.reduce((sum, id) => sum + (testById.get(id)?.price ?? 0), 0);
    const patientIdNum = Number(patientId);

    const include = {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, accountBalance: true } },
      doctor: { select: { id: true, name: true } },
      appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      items: {
        include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true, price: true } } },
      },
    };

    const order = await prisma.$transaction(async (tx) => {
      const apptRow = await tx.appointment.findUnique({
        where: { id: Number(appointmentId) },
        select: { patientId: true, careFileId: true },
      });
      if (!apptRow || apptRow.patientId !== patientIdNum) {
        throw new Error("BAD_REQUEST:Appointment does not match this client.");
      }

      const created = await tx.labOrder.create({
        data: {
          appointmentId: Number(appointmentId),
          patientId: patientIdNum,
          doctorId: Number(doctorId),
          orderedById: auth.userId,
          notes: notes ? String(notes).trim() : null,
          totalAmount,
          careFileId: apptRow.careFileId,
          items: {
            create: uniqueTestIds.map((tid) => ({
              labTestId: tid,
              unitPrice: testById.get(tid)?.price ?? 0,
            })),
          },
        },
      });
      if (totalAmount > 0) {
        await tx.patient.update({
          where: { id: patientIdNum },
          data: { accountBalance: { increment: totalAmount } },
        });
      }
      return tx.labOrder.findUnique({
        where: { id: created.id },
        include,
      });
    });

    if (!order) {
      return NextResponse.json({ error: "Failed to create lab order" }, { status: 500 });
    }

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "lab.order.create",
      module: "lab",
      resourceType: "LabOrder",
      resourceId: order.id,
      metadata: {
        patientId: order.patientId,
        appointmentId: order.appointmentId,
        totalAmount,
        patientCharged: totalAmount > 0,
      },
    });
    return NextResponse.json({ ...order, patient: serializePatient(order.patient) });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    console.error("Create lab order error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
