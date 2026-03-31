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

    const where = branchId ? { branchId: Number(branchId), isActive: true } : { isActive: true };
    const include = { branch: { select: { id: true, name: true } } };

    if (paginate) {
      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.service.count({ where }),
      ]);
      return NextResponse.json({ data: services, total, page, pageSize });
    }

    const services = await prisma.service.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(services);
  } catch (e) {
    console.error("Services list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { name, description, price, durationMinutes, branchId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const service = await prisma.service.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        price: Math.max(0, Number(price) || 0),
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        branchId: branchId ? Number(branchId) : null,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    return NextResponse.json(service);
  } catch (e) {
    console.error("Create service error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
