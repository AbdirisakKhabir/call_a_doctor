import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const appointmentId = searchParams.get("appointmentId");
    if (!patientId) return NextResponse.json({ error: "patientId is required" }, { status: 400 });
    const histories = await prisma.patientHistory.findMany({
      where: {
        patientId: Number(patientId),
        ...(appointmentId ? { appointmentId: Number(appointmentId) } : {}),
      },
      include: {
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(histories);
  } catch (e) {
    console.error("Patient history error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { patientId, appointmentId, doctorId, type, notes } = body;
    if (!patientId || !doctorId || !type || !notes || typeof notes !== "string" || !notes.trim()) {
      return NextResponse.json({ error: "Client, doctor, type and notes are required" }, { status: 400 });
    }
    let careFileId: number | null = null;
    if (appointmentId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: Number(appointmentId) },
        select: { careFileId: true, patientId: true },
      });
      if (appt && appt.patientId === Number(patientId)) {
        careFileId = appt.careFileId ?? null;
      }
    }

    const history = await prisma.patientHistory.create({
      data: {
        patientId: Number(patientId),
        appointmentId: appointmentId ? Number(appointmentId) : null,
        doctorId: Number(doctorId),
        type: String(type).trim(),
        notes: notes.trim(),
        careFileId,
      },
      include: {
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
      },
    });
    return NextResponse.json(history);
  } catch (e) {
    console.error("Create patient history error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
