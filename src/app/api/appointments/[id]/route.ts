import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const { status, startTime, endTime, notes, services } = body;

    const data: Record<string, unknown> = {};
    if (typeof status === "string" && ["scheduled", "completed", "cancelled", "no-show"].includes(status)) data.status = status;
    if (typeof startTime === "string") data.startTime = startTime;
    if (typeof endTime !== "undefined") data.endTime = endTime ? String(endTime) : null;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() : null;

    if (Array.isArray(services)) {
      await prisma.appointmentService.deleteMany({ where: { appointmentId: parsedId } });
      let totalAmount = 0;
      const appointmentServices: { serviceId: number; quantity: number; unitPrice: number; totalAmount: number }[] = [];
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
      if (appointmentServices.length > 0) {
        await prisma.appointmentService.createMany({
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
    }

    const appointment = await prisma.appointment.update({
      where: { id: parsedId },
      data,
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, name: true } },
        services: { include: { service: { select: { id: true, name: true } } } },
      },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.update",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data) },
    });
    return NextResponse.json(appointment);
  } catch (e) {
    console.error("Update appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await prisma.appointment.delete({ where: { id: parsedId } });
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
