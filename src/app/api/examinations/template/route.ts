import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const departmentId = searchParams.get("departmentId");
    const facultyId = searchParams.get("facultyId");

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required to download template" },
        { status: 400 }
      );
    }

    const cls = await prisma.class.findUnique({
      where: { id: Number(classId) },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Get students in this class (from attendance) - unique student IDs
    const attendanceStudentIds = await prisma.attendanceRecord.findMany({
      where: { session: { classId: Number(classId) } },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    const ids = attendanceStudentIds.map((r) => r.studentId);

    let students: { id: number; studentId: string; firstName: string; lastName: string }[];
    if (ids.length > 0) {
      students = await prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, studentId: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });
    } else {
      const deptId = departmentId ? Number(departmentId) : cls.course.departmentId;
      const where: { departmentId: number; status: string; department?: { facultyId: number } } = {
        departmentId: deptId,
        status: "Admitted",
      };
      if (facultyId) where.department = { facultyId: Number(facultyId) };
      students = await prisma.student.findMany({
        where,
        select: { id: true, studentId: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });
    }

    // Match ATU Berbera grade reporting form format (Assignment1, Assignment2 - no Quiz)
    const headers = [
      "S/No",
      "ID Card",
      "Student's Name",
      "Mid Term",
      "Assignment2",
      "Assignment1",
      "final",
      "Attendance",
      "Total",
      "Grade",
      "GPA",
    ];

    const rows = students.map((s, idx) => [
      idx + 1,
      s.studentId,
      `${s.firstName} ${s.lastName}`,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 28 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 8 },
      { wch: 12 },
      { wch: 8 },
      { wch: 6 },
      { wch: 6 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      `Exam ${cls.course.code} ${cls.semester} ${cls.year}`
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Exam_Template_${cls.course.code}_${cls.name}_${cls.semester}_${cls.year}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("Template download error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
