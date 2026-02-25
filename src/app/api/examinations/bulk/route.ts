import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateTotal, getGradeInfo } from "@/lib/grades";
import { isValidSemester } from "@/lib/semesters";

type RecordInput = {
  studentId: number;
  midExam?: number;
  finalExam?: number;
  assessment?: number;
  project?: number;
  assignment?: number;
  presentation?: number;
  totalMarks?: number;
  grade?: string;
  gradePoints?: number;
};

/**
 * POST /api/examinations/bulk
 * Body: { classId, records: RecordInput[], status: "draft" | "approved" }
 * Creates or updates exam records for all students in the payload.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { classId, records, status } = body as {
      classId: number;
      records: RecordInput[];
      status: "draft" | "approved";
    };

    if (!classId || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "classId and records array are required" },
        { status: 400 }
      );
    }

    if (status !== "draft" && status !== "approved") {
      return NextResponse.json(
        { error: "status must be 'draft' or 'approved'" },
        { status: 400 }
      );
    }

    const cls = await prisma.class.findUnique({
      where: { id: Number(classId) },
      select: { id: true, courseId: true, semester: true, year: true },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (!(await isValidSemester(cls.semester))) {
      return NextResponse.json(
        { error: "Invalid semester. Use a semester from the Semesters settings." },
        { status: 400 }
      );
    }

    const created: number[] = [];
    const updated: number[] = [];
    const errors: string[] = [];

    for (const r of records) {
      const studentId = Number(r.studentId);
      if (!Number.isInteger(studentId)) {
        errors.push(`Invalid studentId: ${r.studentId}`);
        continue;
      }

      const marks = {
        midExam: Math.max(0, Math.min(20, Number(r.midExam) || 0)),
        finalExam: Math.max(0, Math.min(40, Number(r.finalExam) || 0)),
        assessment: Math.max(0, Math.min(10, Number(r.assessment) || 0)),
        project: Math.max(0, Math.min(10, Number(r.project) || 0)),
        assignment: Math.max(0, Math.min(10, Number(r.assignment) || 0)),
        presentation: Math.max(0, Math.min(10, Number(r.presentation) || 0)),
      };

      let totalMarks: number;
      let grade: string;
      let gradePoints: number;

      if (r.totalMarks !== undefined && r.totalMarks !== null && !Number.isNaN(Number(r.totalMarks))) {
        totalMarks = Number(r.totalMarks);
      } else {
        totalMarks = calculateTotal(marks);
      }

      if (r.grade && /^[A-D][+-]?|F$/i.test(String(r.grade).trim())) {
        grade = String(r.grade).trim().toUpperCase();
        gradePoints = r.gradePoints !== undefined && r.gradePoints !== null && !Number.isNaN(Number(r.gradePoints))
          ? Number(r.gradePoints)
          : (() => {
              const scale = [
                { grade: "A", points: 4.0 }, { grade: "A-", points: 3.7 }, { grade: "B+", points: 3.3 },
                { grade: "B", points: 3.0 }, { grade: "B-", points: 2.7 }, { grade: "C+", points: 2.3 },
                { grade: "C", points: 2.0 }, { grade: "D", points: 1.0 }, { grade: "F", points: 0.0 },
              ];
              const entry = scale.find((s) => s.grade === grade);
              return entry ? entry.points : 0;
            })();
      } else {
        const info = getGradeInfo(totalMarks);
        grade = info.grade;
        gradePoints = info.gradePoints;
      }

      const existing = await prisma.examRecord.findUnique({
        where: {
          studentId_courseId_semester_year: {
            studentId,
            courseId: cls.courseId,
            semester: cls.semester,
            year: cls.year,
          },
        },
      });

      const data = {
        ...marks,
        totalMarks,
        grade,
        gradePoints,
        status,
      };

      if (existing) {
        await prisma.examRecord.update({
          where: { id: existing.id },
          data,
        });
        updated.push(existing.id);
      } else {
        const rec = await prisma.examRecord.create({
          data: {
            studentId,
            courseId: cls.courseId,
            semester: cls.semester,
            year: cls.year,
            ...data,
          },
        });
        created.push(rec.id);
      }
    }

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      status,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Bulk exam save error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
