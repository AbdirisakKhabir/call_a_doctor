import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parsedId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const [completed, cancelled, noShow, recentAppointments] = await Promise.all([
      prisma.appointment.count({ where: { patientId: parsedId, status: "completed" } }),
      prisma.appointment.count({ where: { patientId: parsedId, status: "cancelled" } }),
      prisma.appointment.count({ where: { patientId: parsedId, status: "no-show" } }),
      prisma.appointment.findMany({
        where: { patientId: parsedId },
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        take: 3,
        include: {
          services: {
            include: { service: { select: { id: true, name: true, durationMinutes: true, price: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ...patient,
      appointmentStats: { completed, cancelled, noShow },
      recentAppointments,
    });
  } catch (e) {
    console.error("Get patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, phone, email, dateOfBirth, gender, address, notes, isActive } = body;

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof phone !== "undefined") data.phone = phone ? String(phone).trim() : null;
    if (typeof email !== "undefined") data.email = email ? String(email).trim() : null;
    if (typeof dateOfBirth !== "undefined") data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (typeof gender !== "undefined") data.gender = gender ? String(gender).trim() : null;
    if (typeof address !== "undefined") data.address = address ? String(address).trim() : null;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;

    const patient = await prisma.patient.update({
      where: { id: parsedId },
      data,
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.update",
      module: "patients",
      resourceType: "Patient",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data) },
    });
    return NextResponse.json(patient);
  } catch (e) {
    console.error("Update patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    await prisma.patient.delete({ where: { id: parsedId } });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.delete",
      module: "patients",
      resourceType: "Patient",
      resourceId: parsedId,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
