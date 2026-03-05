import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHIFTS = ["Morning", "Afternoon", "Evening"];

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const { classId, lecturerId, dayOfWeek, shift, startTime, endTime, room } = body;

    const existing = await prisma.classSchedule.findUnique({ where: { id }, select: { courseId: true, classId: true, lecturerId: true } });
    if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

    const courseId = body.courseId != null ? Number(body.courseId) : existing.courseId;
    const finalClassId = body.classId != null ? Number(body.classId) : existing.classId;
    const finalLecturerId = body.lecturerId != null ? Number(body.lecturerId) : existing.lecturerId;

    const lecturerCourse = await prisma.lecturerCourse.findUnique({
      where: { lecturerId_courseId: { lecturerId: finalLecturerId, courseId } },
    });
    if (!lecturerCourse) {
      return NextResponse.json({ error: "Lecturer is not assigned to this course" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (classId != null) data.classId = Number(classId);
    if (lecturerId != null) data.lecturerId = Number(lecturerId);
    if (dayOfWeek != null) {
      if (!DAYS.includes(String(dayOfWeek))) return NextResponse.json({ error: "Invalid day" }, { status: 400 });
      data.dayOfWeek = String(dayOfWeek);
    }
    if (shift != null) {
      if (!SHIFTS.includes(String(shift))) return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
      data.shift = String(shift);
    }
    if (startTime != null) data.startTime = String(startTime).trim();
    if (endTime != null) data.endTime = String(endTime).trim();
    if (room !== undefined) data.room = room ? String(room).trim() : null;

    const updated = await prisma.classSchedule.update({
      where: { id },
      data,
      include: {
        class: { select: { id: true, name: true } },
        course: { select: { id: true, name: true, code: true } },
        lecturer: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("Update schedule error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await prisma.classSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete schedule error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
