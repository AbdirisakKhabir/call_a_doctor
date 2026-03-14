import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Ensure academic years 2015-2016 through 2025-2026 exist */
async function ensureAcademicYears() {
  const count = await prisma.academicYear.count();
  if (count >= 11) return; // Already have full range

  const currentYear = new Date().getFullYear();
  for (let startYear = 2015; startYear <= 2025; startYear++) {
    const endYear = startYear + 1;
    const name = `${startYear}-${endYear}`;
    await prisma.academicYear.upsert({
      where: { name },
      create: {
        startYear,
        endYear,
        name,
        isActive: startYear === currentYear - 1 || startYear === currentYear,
      },
      update: {},
    });
  }
}

/** GET all academic years */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureAcademicYears();

    const active = req.nextUrl.searchParams.get("active");
    const where = active === "true" ? { isActive: true } : {};

    const years = await prisma.academicYear.findMany({
      where,
      orderBy: [{ startYear: "asc" }],
    });

    return NextResponse.json(years);
  } catch (e) {
    console.error("Academic years list error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
