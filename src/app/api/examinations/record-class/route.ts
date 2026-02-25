import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/examinations/record-class?classId=X
 * Returns class info + all students in the class + their existing exam records for that class's course.
 * Used for the "Record Exams" table when instructor selects Department and Class.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 }
      );
    }

    const parsedClassId = Number(classId);
    if (!Number.isInteger(parsedClassId)) {
      return NextResponse.json({ error: "Invalid classId" }, { status: 400 });
    }

    const cls = await prisma.class.findUnique({
      where: { id: parsedClassId },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            creditHours: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Get all students in this class (students with classId = this class)
    const students = await prisma.student.findMany({
      where: { classId: parsedClassId, status: "Admitted" },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        imageUrl: true,
      },
      orderBy: [{ studentId: "asc" }],
    });

    // Return students with blank records (no pre-filled data)
    const rows = students.map((s) => ({
      student: {
        id: s.id,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        imageUrl: s.imageUrl,
      },
      record: null,
    }));

    return NextResponse.json({
      class: {
        id: cls.id,
        name: cls.name,
        semester: cls.semester,
        year: cls.year,
        course: cls.course,
      },
      rows,
    });
  } catch (e) {
    console.error("Record class error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
