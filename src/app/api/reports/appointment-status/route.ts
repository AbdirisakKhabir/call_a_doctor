import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

function dayEnd(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d, 23, 59, 59, 999);
}

function dayStart(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = (searchParams.get("from") ?? "").trim();
    const to = (searchParams.get("to") ?? "").trim();
    const start = dayStart(from);
    const end = dayEnd(to);
    if (!start || !end || end < start) {
      return NextResponse.json({ error: "Invalid from / to (use YYYY-MM-DD)" }, { status: 400 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    const branchIdRaw = searchParams.get("branchId");
    const doctorIdRaw = searchParams.get("doctorId");

    const where: Prisma.AppointmentWhereInput = {
      appointmentDate: { gte: start, lte: end },
    };

    if (branchFilter) {
      where.branchId = { in: branchFilter };
    }
    if (branchIdRaw && Number.isInteger(Number(branchIdRaw))) {
      const b = Number(branchIdRaw);
      if (branchFilter && !branchFilter.includes(b)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      where.branchId = b;
    }
    if (doctorIdRaw && Number.isInteger(Number(doctorIdRaw))) {
      where.doctorId = Number(doctorIdRaw);
    }

    const rows = await prisma.appointment.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ appointmentDate: "asc" }, { startTime: "asc" }, { id: "asc" }],
      take: 5000,
    });

    const ids = rows.map((r) => r.id);
    const formCountByAppt = new Map<number, number>();
    if (ids.length > 0) {
      const formCounts = await prisma.customFormResponse.groupBy({
        by: ["appointmentId"],
        where: { appointmentId: { in: ids } },
        _count: { id: true },
      });
      for (const g of formCounts) {
        if (g.appointmentId != null) formCountByAppt.set(g.appointmentId, g._count.id);
      }
    }

    return NextResponse.json({
      range: { from, to },
      rows: rows.map((a) => ({
        id: a.id,
        appointmentDate: a.appointmentDate.toISOString().slice(0, 10),
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        totalAmount: a.totalAmount,
        completionChecklistLab: a.completionChecklistLab,
        completionChecklistPrescription: a.completionChecklistPrescription,
        completionChecklistClinicNote: a.completionChecklistClinicNote,
        clinicFormCount: formCountByAppt.get(a.id) ?? 0,
        branch: a.branch,
        doctor: a.doctor,
        patient: serializePatient(a.patient),
      })),
    });
  } catch (e) {
    console.error("appointment-status report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
