import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { normalizeLabUnitKey } from "@/lib/lab-inventory-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

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
    if (!(await userHasPermission(auth.userId, "lab.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const {
      categoryId,
      name,
      code,
      unit,
      normalRange,
      price,
      disposables: disposablesRaw,
    } = body;
    if (!categoryId || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Category and name are required" }, { status: 400 });
    }
    const priceNum = price != null ? Math.max(0, Number(price)) : 0;

    type DispIn = { productCode: string; unitsPerTest: number; deductionUnitKey: string };
    const disposablesIn: DispIn[] = [];
    if (Array.isArray(disposablesRaw)) {
      const seen = new Set<string>();
      for (const row of disposablesRaw) {
        const productCode =
          row && typeof row === "object" && typeof (row as { productCode?: unknown }).productCode === "string"
            ? normalizeProductCode((row as { productCode: string }).productCode)
            : "";
        const unitsPerTest = Number((row as { unitsPerTest?: unknown })?.unitsPerTest);
        const deductionUnitKey = normalizeLabUnitKey(
          row && typeof row === "object" && typeof (row as { deductionUnitKey?: unknown }).deductionUnitKey === "string"
            ? (row as { deductionUnitKey: string }).deductionUnitKey
            : "base"
        );
        if (!productCode) {
          return NextResponse.json({ error: "Each disposable needs a product code" }, { status: 400 });
        }
        if (!Number.isFinite(unitsPerTest) || unitsPerTest <= 0) {
          return NextResponse.json({ error: "Units per test must be a positive number for each disposable" }, { status: 400 });
        }
        if (seen.has(productCode)) {
          return NextResponse.json({ error: `Duplicate disposable product code: ${productCode}` }, { status: 400 });
        }
        seen.add(productCode);
        disposablesIn.push({ productCode, unitsPerTest, deductionUnitKey });
      }
    }

    const test = await prisma.$transaction(async (tx) => {
      const created = await tx.labTest.create({
        data: {
          categoryId: Number(categoryId),
          name: name.trim(),
          code: code ? String(code).trim() : null,
          unit: unit ? String(unit).trim() : null,
          normalRange: normalRange ? String(normalRange).trim() : null,
          price: Number.isFinite(priceNum) ? priceNum : 0,
        },
      });

      for (const d of disposablesIn) {
        await tx.labTestDisposable.create({
          data: {
            labTestId: created.id,
            productCode: d.productCode,
            unitsPerTest: d.unitsPerTest,
            deductionUnitKey: d.deductionUnitKey,
          },
        });
      }

      return tx.labTest.findUniqueOrThrow({
        where: { id: created.id },
        include: { category: { select: { id: true, name: true } } },
      });
    });

    return NextResponse.json(test);
  } catch (e: unknown) {
    console.error("Create lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
