import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const order = await prisma.labOrder.findUnique({
      where: { id: parsedId },
      include: {
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentDate: true, startTime: true } },
        items: {
          include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true, price: true } } },
        },
      },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...order, patient: serializePatient(order.patient) });
  } catch (e) {
    console.error("Lab order get error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
