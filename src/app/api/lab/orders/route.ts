import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

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
      patient: { select: { id: true, patientCode: true, name: true } },
      doctor: { select: { id: true, name: true } },
      appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      items: { include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true } } } },
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
      return NextResponse.json({ data: orders, total, page, pageSize });
    }

    const orders = await prisma.labOrder.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(orders);
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
      return NextResponse.json({ error: "Appointment, patient, doctor and at least one test are required" }, { status: 400 });
    }
    const order = await prisma.labOrder.create({
      data: {
        appointmentId: Number(appointmentId),
        patientId: Number(patientId),
        doctorId: Number(doctorId),
        orderedById: auth.userId,
        notes: notes ? String(notes).trim() : null,
        items: {
          create: testIds.map((tid: number) => ({ labTestId: Number(tid) })),
        },
      },
      include: {
        patient: { select: { id: true, patientCode: true, name: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
        items: { include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true } } } },
      },
    });
    return NextResponse.json(order);
  } catch (e) {
    console.error("Create lab order error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
