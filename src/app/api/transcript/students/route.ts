import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId");
    const classId = searchParams.get("classId");

    const where: { departmentId?: number; classId?: number; status?: string } = {
      status: "Admitted",
    };
    if (departmentId) where.departmentId = Number(departmentId);
    if (classId) where.classId = Number(classId);

    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        studentId: true,
        firstName: true,
        lastName: true,
        department: { select: { id: true, name: true, code: true } },
        class: {
          select: {
            id: true,
            name: true,
            semester: true,
            year: true,
            course: { select: { code: true } },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json(students);
  } catch (e) {
    console.error("Transcript students list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
