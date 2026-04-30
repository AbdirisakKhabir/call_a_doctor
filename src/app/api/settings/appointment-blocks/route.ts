import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { parseWindowsFromRequest } from "@/lib/appointment-block-windows";
import { serializeAppointmentScheduleBlock } from "@/lib/serialize-appointment-schedule-block";

const windowsInclude = { windows: { orderBy: { sortOrder: "asc" as const } } };

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canManage = await userHasPermission(auth.userId, "settings.manage");
    const canViewCal = await userHasPermission(auth.userId, "appointments.view");
    if (!canManage && !canViewCal) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startQ = searchParams.get("startDate")?.trim() ?? "";
    const endQ = searchParams.get("endDate")?.trim() ?? "";

    const where: Record<string, unknown> = {};
    if (!canManage) where.isActive = true;

    if (/^\d{4}-\d{2}-\d{2}$/.test(startQ) && /^\d{4}-\d{2}-\d{2}$/.test(endQ)) {
      const rangeStart = new Date(startQ + "T12:00:00");
      const rangeEnd = new Date(endQ + "T12:00:00");
      where.AND = [{ startDate: { lte: rangeEnd } }, { endDate: { gte: rangeStart } }];
    }

    const blocks = await prisma.appointmentScheduleBlock.findMany({
      where,
      include: { branch: { select: { id: true, name: true } }, ...windowsInclude },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });

    return NextResponse.json({ blocks: blocks.map(serializeAppointmentScheduleBlock) });
  } catch (e) {
    console.error("GET appointment-blocks:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json() as Record<string, unknown>;
    const label = typeof body.label === "string" ? body.label.trim() || null : null;
    const branchIdRaw = body.branchId;
    const branchId =
      branchIdRaw === null || branchIdRaw === "" || typeof branchIdRaw === "undefined"
        ? null
        : Number(branchIdRaw);
    if (branchId !== null && (!Number.isInteger(branchId) || branchId <= 0)) {
      return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
    }

    const startDateStr = typeof body.startDate === "string" ? body.startDate.trim().slice(0, 10) : "";
    const endDateStr = typeof body.endDate === "string" ? body.endDate.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
      return NextResponse.json({ error: "startDate and endDate must be YYYY-MM-DD" }, { status: 400 });
    }
    if (endDateStr < startDateStr) {
      return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
    }

    const allDay = body.allDay !== false;

    const parsedWin = parseWindowsFromRequest(body, allDay);
    if (!parsedWin.ok) {
      return NextResponse.json({ error: parsedWin.error }, { status: 400 });
    }
    const { windows } = parsedWin;

    if (branchId !== null) {
      const br = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
      if (!br) return NextResponse.json({ error: "Branch not found" }, { status: 400 });
    }

    const startDate = new Date(startDateStr + "T12:00:00");
    const endDate = new Date(endDateStr + "T12:00:00");

    const row = await prisma.appointmentScheduleBlock.create({
      data: {
        branchId,
        startDate,
        endDate,
        allDay,
        label,
        isActive: body.isActive === false ? false : true,
        windows:
          !allDay && windows.length > 0
            ? { create: windows.map((w, i) => ({ startTime: w.startTime, endTime: w.endTime, sortOrder: i })) }
            : undefined,
      },
      include: { branch: { select: { id: true, name: true } }, ...windowsInclude },
    });

    return NextResponse.json({ block: serializeAppointmentScheduleBlock(row) });
  } catch (e) {
    console.error("POST appointment-blocks:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
