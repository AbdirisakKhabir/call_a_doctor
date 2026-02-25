import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateGPA } from "@/lib/grades";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        imageUrl: true,
        admissionDate: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
            faculty: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const records = await prisma.examRecord.findMany({
      where: { studentId: Number(studentId) },
      include: {
        course: {
          select: { id: true, name: true, code: true, creditHours: true },
        },
      },
      orderBy: [{ year: "desc" }, { semester: "asc" }],
    });

    const semesters = await prisma.semester.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, sortOrder: true },
    });
    const semOrderMap = semesters.reduce<Record<string, number>>((acc, s, i) => {
      acc[s.name] = s.sortOrder ?? i;
      return acc;
    }, {});

    const gpaData = calculateGPA(
      records.map((r) => ({
        semester: r.semester,
        year: r.year,
        gradePoints: r.gradePoints,
        creditHours: r.course.creditHours,
      })),
      semOrderMap
    );

    return NextResponse.json({
      student,
      records,
      gpa: gpaData,
    });
  } catch (e) {
    console.error("GPA calculation error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
