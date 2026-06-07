import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const bid = branchId ? Number(branchId) : NaN;
    const where =
      Number.isInteger(bid) && bid > 0
        ? { isActive: true as const, OR: [{ branchId: bid }, { branchId: null }] }
        : { isActive: true as const };
    const include = { branch: { select: { id: true, name: true } } };

    if (paginate) {
      const [doctors, total] = await Promise.all([
        prisma.doctor.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.doctor.count({ where }),
      ]);
      return NextResponse.json({ data: doctors, total, page, pageSize });
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(doctors);
  } catch (e) {
    console.error("Doctors list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { name, email, phone, specialty, branchId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const doctor = await prisma.doctor.create({
      data: {
        name: String(name).trim(),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        specialty: specialty ? String(specialty).trim() : null,
        branchId: branchId ? Number(branchId) : null,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    return NextResponse.json(doctor);
  } catch (e) {
    console.error("Create doctor error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
