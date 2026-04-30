import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { parseWindowsFromRequest } from "@/lib/appointment-block-windows";
import { serializeAppointmentScheduleBlock } from "@/lib/serialize-appointment-schedule-block";

const windowsInclude = { windows: { orderBy: { sortOrder: "asc" as const } } };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    const existing = await prisma.appointmentScheduleBlock.findUnique({
      where: { id: parsedId },
      include: windowsInclude,
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (typeof body.label !== "undefined") {
      data.label = typeof body.label === "string" ? body.label.trim() || null : null;
    }
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (typeof body.branchId !== "undefined") {
      const branchIdRaw = body.branchId;
      const branchId =
        branchIdRaw === null || branchIdRaw === "" ? null : Number(branchIdRaw);
      if (branchId !== null && (!Number.isInteger(branchId) || branchId <= 0)) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchId !== null) {
        const br = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } });
        if (!br) return NextResponse.json({ error: "Branch not found" }, { status: 400 });
      }
      data.branchId = branchId;
    }

    if (typeof body.startDate === "string") {
      const s = body.startDate.trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
      }
      data.startDate = new Date(s + "T12:00:00");
    }
    if (typeof body.endDate === "string") {
      const s = body.endDate.trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
      }
      data.endDate = new Date(s + "T12:00:00");
    }

    if (typeof body.allDay === "boolean") {
      data.allDay = body.allDay;
    }

    const mergedAllDay =
      typeof body.allDay === "boolean" ? body.allDay : existing.allDay;

    const startD = (data.startDate as Date | undefined) ?? existing.startDate;
    const endD = (data.endDate as Date | undefined) ?? existing.endDate;
    const ky = (d: Date) => {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    if (ky(endD) < ky(startD)) {
      return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
    }

    if (mergedAllDay === false) {
      if (existing.allDay && !Array.isArray(body.windows)) {
        return NextResponse.json(
          { error: "Add at least one time window when switching from all-day to partial hours." },
          { status: 400 }
        );
      }
      if (Array.isArray(body.windows)) {
        const p = parseWindowsFromRequest(body, false);
        if (!p.ok) {
          return NextResponse.json({ error: p.error }, { status: 400 });
        }
      }
    }

    const willUpdateScalars = Object.keys(data).length > 0;
    const willReplaceWindows = Array.isArray(body.windows) && mergedAllDay === false;
    const willClearWindows = mergedAllDay === true;

    if (!willUpdateScalars && !willReplaceWindows && !willClearWindows) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const row = await prisma.$transaction(async (tx) => {
      if (willUpdateScalars) {
        await tx.appointmentScheduleBlock.update({
          where: { id: parsedId },
          data,
        });
      }

      if (willClearWindows) {
        await tx.appointmentScheduleBlockWindow.deleteMany({ where: { blockId: parsedId } });
      } else if (willReplaceWindows) {
        const p = parseWindowsFromRequest(body, false);
        if (!p.ok) throw new Error(`BAD_REQUEST:${p.error}`);
        await tx.appointmentScheduleBlockWindow.deleteMany({ where: { blockId: parsedId } });
        if (p.windows.length > 0) {
          await tx.appointmentScheduleBlockWindow.createMany({
            data: p.windows.map((w, i) => ({
              blockId: parsedId,
              startTime: w.startTime,
              endTime: w.endTime,
              sortOrder: i,
            })),
          });
        }
      }

      const full = await tx.appointmentScheduleBlock.findUnique({
        where: { id: parsedId },
        include: { branch: { select: { id: true, name: true } }, ...windowsInclude },
      });
      if (!full) throw new Error("NOT_FOUND");
      return full;
    });

    return NextResponse.json({ block: serializeAppointmentScheduleBlock(row) });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.slice("BAD_REQUEST:".length).trim() }, { status: 400 });
    }
    console.error("PATCH appointment-blocks:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    try {
      await prisma.appointmentScheduleBlock.delete({ where: { id: parsedId } });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE appointment-blocks:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
