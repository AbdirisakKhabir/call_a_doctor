import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = categoryId ? { categoryId: Number(categoryId) } : {};
    const include = { category: { select: { id: true, name: true } } };

    if (paginate) {
      const [tests, total] = await Promise.all([
        prisma.labTest.findMany({
          where,
          include,
          orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
          skip,
          take: pageSize,
        }),
        prisma.labTest.count({ where }),
      ]);
      return NextResponse.json({ data: tests, total, page, pageSize });
    }

    const tests = await prisma.labTest.findMany({
      where,
      include,
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });
    return NextResponse.json(tests);
  } catch (e) {
    console.error("Lab tests error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { categoryId, name, code, unit, normalRange, price } = body;
    if (!categoryId || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Category and name are required" }, { status: 400 });
    }
    const priceNum = price != null ? Math.max(0, Number(price)) : 0;
    const test = await prisma.labTest.create({
      data: {
        categoryId: Number(categoryId),
        name: name.trim(),
        code: code ? String(code).trim() : null,
        unit: unit ? String(unit).trim() : null,
        normalRange: normalRange ? String(normalRange).trim() : null,
        price: Number.isFinite(priceNum) ? priceNum : 0,
      },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json(test);
  } catch (e) {
    console.error("Create lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
