import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";

/** Previous or next appointment by calendar order (date, then start time). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const direction = new URL(req.url).searchParams.get("direction");
    if (direction !== "prev" && direction !== "next") {
      return NextResponse.json({ error: "direction must be prev or next" }, { status: 400 });
    }

    const cur = await prisma.appointment.findUnique({
      where: { id: parsedId },
      select: { id: true, appointmentDate: true, startTime: true },
    });
    if (!cur) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const include = {
      branch: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true, specialty: true } },
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      services: {
        include: { service: { select: { id: true, name: true, color: true } } },
      },
    } as const;

    if (direction === "prev") {
      const prev = await prisma.appointment.findFirst({
        where: {
          id: { not: cur.id },
          OR: [
            { appointmentDate: { lt: cur.appointmentDate } },
            {
              appointmentDate: cur.appointmentDate,
              startTime: { lt: cur.startTime },
            },
          ],
        },
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        include,
      });
      return NextResponse.json({
        appointment: prev ? { ...prev, patient: serializePatient(prev.patient) } : null,
      });
    }

    const next = await prisma.appointment.findFirst({
      where: {
        id: { not: cur.id },
        OR: [
          { appointmentDate: { gt: cur.appointmentDate } },
          {
            appointmentDate: cur.appointmentDate,
            startTime: { gt: cur.startTime },
          },
        ],
      },
      orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }],
      include,
    });
    return NextResponse.json({
      appointment: next ? { ...next, patient: serializePatient(next.patient) } : null,
    });
  } catch (e) {
    console.error("Adjacent appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
