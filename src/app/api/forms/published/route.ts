import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

/** Published forms for appointment / clinic note picker. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed =
      (await userHasPermission(auth.userId, "forms.view")) ||
      (await userHasPermission(auth.userId, "patient_history.create")) ||
      (await userHasPermission(auth.userId, "patient_history.view"));

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.customForm.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        description: true,
        updatedAt: true,
        _count: { select: { fields: true } },
      },
      orderBy: [{ title: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Published forms list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
