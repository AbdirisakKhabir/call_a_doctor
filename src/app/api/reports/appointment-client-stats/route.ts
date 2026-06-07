import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

/** Bookings in range excluding cancelled; used for visit counts and service/client stats. */
const ACTIVE_STATUSES = { not: "cancelled" as const };

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branchIdParam = searchParams.get("branchId");

    if (!from || !to) {
      return NextResponse.json({ error: "Query parameters from and to (YYYY-MM-DD) are required." }, { status: 400 });
    }

    const dateFilter: { gte: Date; lte: Date } = {
      gte: new Date(from),
      lte: (() => {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        return end;
      })(),
    };

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    let branchId: number | undefined;
    if (branchIdParam && branchIdParam !== "") {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      branchId = bid;
    } else if (branchFilter && branchFilter.length === 1) {
      branchId = branchFilter[0];
    }

    const branchScope =
      branchId != null
        ? { branchId }
        : branchFilter && branchFilter.length > 0
          ? { branchId: { in: branchFilter } }
          : {};

    const appointmentWhere = {
      status: ACTIVE_STATUSES,
      appointmentDate: dateFilter,
      ...branchScope,
    };

    const [totalVisits, byDay, byStatus, serviceLines, branchRow] = await Promise.all([
      prisma.appointment.count({ where: appointmentWhere }),
      prisma.appointment.groupBy({
        by: ["appointmentDate"],
        where: appointmentWhere,
        _count: { id: true },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: appointmentWhere,
        _count: { id: true },
      }),
      prisma.appointmentService.findMany({
        where: { appointment: appointmentWhere },
        select: {
          serviceId: true,
          quantity: true,
          appointmentId: true,
          appointment: { select: { patientId: true } },
          service: { select: { name: true } },
        },
      }),
      branchId != null
        ? prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    const visitsByDay = byDay
      .map((row) => ({
        date: row.appointmentDate.toISOString().slice(0, 10),
        count: row._count.id,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const visitByStatus = byStatus
      .map((row) => ({
        status: row.status,
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const serviceMap = new Map<
      number,
      { serviceName: string; patients: Set<number>; appointmentIds: Set<number>; lineQty: number }
    >();

    for (const line of serviceLines) {
      let agg = serviceMap.get(line.serviceId);
      if (!agg) {
        agg = {
          serviceName: line.service.name,
          patients: new Set(),
          appointmentIds: new Set(),
          lineQty: 0,
        };
        serviceMap.set(line.serviceId, agg);
      }
      agg.patients.add(line.appointment.patientId);
      agg.appointmentIds.add(line.appointmentId);
      agg.lineQty += line.quantity;
    }

    const services = [...serviceMap.entries()]
      .map(([serviceId, agg]) => ({
        serviceId,
        serviceName: agg.serviceName,
        distinctClients: agg.patients.size,
        bookingCount: agg.appointmentIds.size,
        serviceLines: agg.lineQty,
      }))
      .sort((a, b) => b.distinctClients - a.distinctClients || b.bookingCount - a.bookingCount);

    const branchLabelResolved =
      branchRow?.name ??
      (branchId == null && (!branchFilter || branchFilter.length === 0)
        ? "All branches"
        : branchId == null && branchFilter && branchFilter.length > 1
          ? "All my branches"
          : null);

    return NextResponse.json({
      range: { from: from.slice(0, 10), to: to.slice(0, 10) },
      branchId: branchId ?? null,
      branchLabel: branchLabelResolved,
      visitSummary: {
        totalVisits,
        byStatus: visitByStatus,
      },
      visitsByDay,
      services,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
