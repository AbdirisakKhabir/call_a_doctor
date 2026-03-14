import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteImage } from "@/lib/cloudinary";

/**
 * POST /api/students/bulk-delete
 * Body: { ids?: number[], departmentId?: number }
 * Deletes students by IDs or by department.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ids, departmentId } = body as {
      ids?: number[];
      departmentId?: number;
    };

    let studentIds: number[];

    if (ids && Array.isArray(ids) && ids.length > 0) {
      studentIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id));
    } else if (departmentId != null && Number.isInteger(Number(departmentId))) {
      const students = await prisma.student.findMany({
        where: { departmentId: Number(departmentId) },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    } else {
      return NextResponse.json(
        { error: "Provide ids (array of student IDs) or departmentId" },
        { status: 400 }
      );
    }

    if (studentIds.length === 0) {
      return NextResponse.json({
        deleted: 0,
        skipped: 0,
        errors: ["No valid students to delete"],
      });
    }

    const deleted: number[] = [];
    const errors: string[] = [];

    for (const id of studentIds) {
      try {
        const student = await prisma.student.findUnique({
          where: { id },
          select: { id: true, studentId: true, imagePublicId: true },
        });
        if (!student) {
          errors.push(`Student ${id} not found`);
          continue;
        }
        if (student.imagePublicId) {
          try {
            await deleteImage(student.imagePublicId);
          } catch {
            // Ignore Cloudinary deletion errors
          }
        }
        await prisma.student.delete({ where: { id } });
        deleted.push(id);
      } catch (e) {
        errors.push(`Failed to delete student ${id}`);
      }
    }

    return NextResponse.json({
      deleted: deleted.length,
      skipped: studentIds.length - deleted.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Bulk delete students error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
