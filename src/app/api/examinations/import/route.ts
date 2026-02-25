import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { calculateTotal, getGradeInfo, getGradePointsFromGrade } from "@/lib/grades";

/** Find column index by flexible header matching */
function findCol(headerRow: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = headerRow.findIndex((h) => p.test(String(h).trim()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const classId = formData.get("classId") as string | null;

    if (!file || !classId) {
      return NextResponse.json(
        { error: "file and classId are required" },
        { status: 400 }
      );
    }

    const cls = await prisma.class.findUnique({
      where: { id: Number(classId) },
      select: { id: true, courseId: true, semester: true, year: true, course: { select: { code: true, name: true } } },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as (string | number)[][];

    if (!data || data.length < 2) {
      return NextResponse.json(
        { error: "Excel file must have a header row and at least one student row" },
        { status: 400 }
      );
    }

    const headerRow = (data[0] as string[]).map((h) => String(h ?? "").trim());

    // Student ID: "ID Card", "Student ID", etc.
    const studentIdIdx = findCol(headerRow, [
      /^id\s*card$/i,
      /^student\s*id$/i,
      /^studentid$/i,
    ]);
    if (studentIdIdx < 0) {
      return NextResponse.json(
        { error: "Excel must contain an 'ID Card' or 'Student ID' column" },
        { status: 400 }
      );
    }

    // Assessment columns - all optional (empty = 0). No Quiz - Assignment1, Assignment2 only.
    const midIdx = findCol(headerRow, [/^mid\s*term$/i, /^mid\s*exam/i, /^mid$/i]);
    const finalIdx = findCol(headerRow, [/^final$/i, /^final\s*exam/i]);
    const assign2Idx = findCol(headerRow, [/^assignment2$/i, /^assign2$/i]);
    const assign1Idx = findCol(headerRow, [/^assignment1$/i, /^assignment$/i, /^assign1$/i]);
    const attendanceIdx = findCol(headerRow, [/^attendance$/i]);

    // Pre-computed values from file - use when provided
    const totalIdx = findCol(headerRow, [/^total$/i]);
    const gradeIdx = findCol(headerRow, [/^grade$/i]);
    const gpaIdx = findCol(headerRow, [/^gpa$/i]);

    const created: number[] = [];
    const updated: number[] = [];
    const errors: string[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number)[];
      if (!row || row.length === 0) continue;

      const studentIdStr = String(row[studentIdIdx] ?? "").trim();
      if (!studentIdStr) continue;

      const student = await prisma.student.findUnique({
        where: { studentId: studentIdStr },
        select: { id: true },
      });

      if (!student) {
        errors.push(`Row ${i + 1}: Student "${studentIdStr}" not found`);
        continue;
      }

      // Parse optional assessment columns - empty or missing = 0. No Quiz.
      const mid = parseNum(row[midIdx]);
      const final = parseNum(row[finalIdx]);
      const assign2 = parseNum(row[assign2Idx]);
      const assign1 = parseNum(row[assign1Idx]);
      const attendance = parseNum(row[attendanceIdx]);

      const marks = {
        midExam: mid,
        finalExam: final,
        assessment: 0, // No Quiz
        project: assign2,
        assignment: assign1,
        presentation: attendance,
      };

      // Validate only when value is provided and column exists
      if (midIdx >= 0 && (marks.midExam < 0 || marks.midExam > 20)) {
        errors.push(`Row ${i + 1}: Mid Term must be 0-20`);
        continue;
      }
      if (finalIdx >= 0 && (marks.finalExam < 0 || marks.finalExam > 40)) {
        errors.push(`Row ${i + 1}: Final must be 0-40`);
        continue;
      }
      const max10 = [marks.assessment, marks.project, marks.assignment, marks.presentation];
      if (max10.some((v) => v < 0 || v > 10)) {
        errors.push(`Row ${i + 1}: Assignment1, Assignment2, Attendance must be 0-10`);
        continue;
      }

      let totalMarks: number;
      let grade: string;
      let gradePoints: number;

      const fileTotal = totalIdx >= 0 ? parseNumOrNull(row[totalIdx]) : null;
      const fileGrade = gradeIdx >= 0 ? String(row[gradeIdx] ?? "").trim() : "";
      const fileGpa = gpaIdx >= 0 ? parseNumOrNull(row[gpaIdx]) : null;

      // Use Total from file when provided; otherwise calculate from components
      totalMarks =
        fileTotal !== null && fileTotal >= 0 ? fileTotal : calculateTotal(marks);

      if (fileGrade && /^[A-D][+-]?|F$/i.test(fileGrade)) {
        grade = fileGrade.toUpperCase().replace(/^([A-D])$/, "$1");
        const pts = getGradePointsFromGrade(grade);
        gradePoints = fileGpa !== null ? fileGpa : pts ?? 0;
      } else {
        const info = getGradeInfo(totalMarks);
        grade = info.grade;
        gradePoints = info.gradePoints;
      }

      const existing = await prisma.examRecord.findUnique({
        where: {
          studentId_courseId_semester_year: {
            studentId: student.id,
            courseId: cls.courseId,
            semester: cls.semester,
            year: cls.year,
          },
        },
      });

      if (existing) {
        await prisma.examRecord.update({
          where: { id: existing.id },
          data: { ...marks, totalMarks, grade, gradePoints, status: "draft" },
        });
        updated.push(existing.id);
      } else {
        const rec = await prisma.examRecord.create({
          data: {
            studentId: student.id,
            courseId: cls.courseId,
            semester: cls.semester,
            year: cls.year,
            ...marks,
            totalMarks,
            grade,
            gradePoints,
            status: "draft",
          },
        });
        created.push(rec.id);
      }
    }

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Exam import error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function parseNum(val: string | number | undefined): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function parseNumOrNull(val: string | number | undefined): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}
