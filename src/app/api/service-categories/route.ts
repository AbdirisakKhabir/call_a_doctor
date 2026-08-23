import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { capitalizeNamePart } from "@/lib/capitalize-name";
import { isPrismaUniqueError } from "@/lib/service-category";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const activeOnly = searchParams.get("all") !== "true";
    const where = activeOnly ? { isActive: true } : undefined;
    const include = { _count: { select: { services: true } } };

    if (paginate) {
      const [list, total] = await Promise.all([
        prisma.serviceCategory.findMany({
          where,
          orderBy: { name: "asc" },
          include,
          skip,
          take: pageSize,
        }),
        prisma.serviceCategory.count({ where }),
      ]);
      return NextResponse.json({ data: list, total, page, pageSize });
    }

    const list = await prisma.serviceCategory.findMany({
      where,
      orderBy: { name: "asc" },
      include,
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error("Service categories error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { name, description } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const cat = await prisma.serviceCategory.create({
      data: {
        name: capitalizeNamePart(name),
        description: description ? String(description).trim() : null,
      },
    });
    return NextResponse.json(cat);
  } catch (e) {
    if (isPrismaUniqueError(e)) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 400 });
    }
    console.error("Create service category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
