import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
        patient: { select: { id: true, patientCode: true, name: true } },
        services: {
          include: { service: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json(appointments);
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
    const { branchId, doctorId, patientId, appointmentDate, startTime, endTime, notes, services } = body;

    if (!branchId || !doctorId || !patientId || !appointmentDate || !startTime) {
      return NextResponse.json({ error: "Branch, doctor, patient, date and start time are required" }, { status: 400 });
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

    const appointment = await prisma.appointment.create({
      data: {
        branchId: Number(branchId),
        doctorId: Number(doctorId),
        patientId: Number(patientId),
        appointmentDate: new Date(appointmentDate),
        startTime: String(startTime),
        endTime: endTime ? String(endTime) : null,
        notes: notes ? String(notes).trim() : null,
        totalAmount,
        status: "scheduled",
        createdById: auth.userId,
        services: appointmentServices.length
          ? { create: appointmentServices }
          : undefined,
      },
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, name: true } },
        services: { include: { service: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(appointment);
  } catch (e) {
    console.error("Create appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
