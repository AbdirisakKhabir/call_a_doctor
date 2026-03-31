import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveBranchAccess } from "@/lib/pharmacy-branch";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resolved = await requireActiveBranchAccess(auth.userId, searchParams.get("branchId"));
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = { branchId, isActive: true };

    if (paginate) {
      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.category.count({ where }),
      ]);
      return NextResponse.json({ data: categories, total, page, pageSize });
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (e) {
    console.error("Categories list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, branchId: bodyBranchId } = body;

    const resolved = await requireActiveBranchAccess(auth.userId, bodyBranchId);
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await prisma.category.findUnique({
      where: { branchId_name: { branchId, name: name.trim() } },
    });
    if (existing) {
      return NextResponse.json({ error: "Category with this name already exists at this branch" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        branchId,
        name: name.trim(),
        description: description ? String(description).trim() : null,
      },
    });
    return NextResponse.json(category);
  } catch (e) {
    console.error("Create category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
