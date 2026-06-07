import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(
      new URL(req.url).searchParams
    );

    const include = { _count: { select: { tests: true } } };

    if (paginate) {
      const [list, total] = await Promise.all([
        prisma.labCategory.findMany({
          orderBy: { name: "asc" },
          include,
          skip,
          take: pageSize,
        }),
        prisma.labCategory.count(),
      ]);
      return NextResponse.json({ data: list, total, page, pageSize });
    }

    const list = await prisma.labCategory.findMany({
      orderBy: { name: "asc" },
      include,
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error("Lab categories error:", e);
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
    const cat = await prisma.labCategory.create({
      data: { name: name.trim(), description: description ? String(description).trim() : null },
    });
    return NextResponse.json(cat);
  } catch (e) {
    console.error("Create lab category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
