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
    const q = searchParams.get("q") || "";
    const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit")) || 20));

    const patients = await prisma.patient.findMany({
      where: q.trim()
        ? {
            isActive: true,
            OR: [
              { name: { contains: q } },
              { patientCode: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : { isActive: true },
      select: {
        id: true,
        patientCode: true,
        name: true,
        phone: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });
    return NextResponse.json(patients);
  } catch (e) {
    console.error("Patient search error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
