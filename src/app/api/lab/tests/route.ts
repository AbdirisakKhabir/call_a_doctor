import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { ensureLabPackagingUnitsFromPharmacyProduct, normalizeLabUnitKey } from "@/lib/lab-inventory-units";
import { assertLabTestParentAssignment } from "@/lib/lab-test-parent";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const scope = searchParams.get("scope");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where: {
      categoryId?: number;
      parentTestId?: { not: null } | null;
    } = {};
    if (categoryId) {
      where.categoryId = Number(categoryId);
    }
    if (scope === "subtests") {
      where.parentTestId = { not: null };
    }

    const subtestsListInclude = {
      category: { select: { id: true, name: true } },
      parentTest: { select: { id: true, name: true } },
    };

    const include =
      scope === "subtests"
        ? subtestsListInclude
        : {
            category: { select: { id: true, name: true } },
            subtests: {
              where: { isActive: true },
              select: { id: true, name: true },
              orderBy: { name: "asc" as const },
            },
            parentTest: { select: { id: true, name: true } },
          };

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
      parentTestId: parentTestIdRaw,
      disposables: disposablesRaw,
      disposableBranchId: disposableBranchIdRaw,
    } = body;
    const disposableBranchId =
      disposableBranchIdRaw != null && disposableBranchIdRaw !== ""
        ? Number(disposableBranchIdRaw)
        : NaN;
    if (!categoryId || !name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Category and name are required" }, { status: 400 });
    }
    const priceNum = price != null ? Math.max(0, Number(price)) : 0;

    type DispIn = { productCode: string; unitsPerTest: number; deductionUnitKey: string };
    const disposablesIn: DispIn[] = [];
    if (Array.isArray(disposablesRaw)) {
      const seen = new Set<string>();
      for (const row of disposablesRaw) {
        if (!row || typeof row !== "object") continue;
        const productCode =
          typeof (row as { productCode?: unknown }).productCode === "string"
            ? normalizeProductCode((row as { productCode: string }).productCode)
            : "";
        const unitsPerTest = Number((row as { unitsPerTest?: unknown })?.unitsPerTest);
        const deductionUnitKey = normalizeLabUnitKey(
          typeof (row as { deductionUnitKey?: unknown }).deductionUnitKey === "string"
            ? (row as { deductionUnitKey: string }).deductionUnitKey
            : "base"
        );
        if (!productCode) {
          continue;
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

    if (disposablesIn.length > 0) {
      if (!Number.isInteger(disposableBranchId) || disposableBranchId <= 0) {
        return NextResponse.json(
          { error: "disposableBranchId is required when the test has disposables" },
          { status: 400 }
        );
      }
    }

    const parentTestId =
      parentTestIdRaw != null && parentTestIdRaw !== ""
        ? Number(parentTestIdRaw)
        : null;
    if (parentTestId != null && (!Number.isInteger(parentTestId) || parentTestId <= 0)) {
      return NextResponse.json({ error: "Invalid parent panel test" }, { status: 400 });
    }

    const test = await prisma.$transaction(async (tx) => {
      const parentErr = await assertLabTestParentAssignment(tx, { parentTestId });
      if (parentErr) {
        throw new Error(`BAD_REQUEST:${parentErr}`);
      }
      const created = await tx.labTest.create({
        data: {
          categoryId: Number(categoryId),
          name: name.trim(),
          code: code ? String(code).trim() : null,
          unit: unit ? String(unit).trim() : null,
          normalRange: normalRange ? String(normalRange).trim() : null,
          price: parentTestId != null ? 0 : Number.isFinite(priceNum) ? priceNum : 0,
          ...(parentTestId != null ? { parentTestId } : {}),
        },
      });

      for (const d of disposablesIn) {
        const ensured = await ensureLabPackagingUnitsFromPharmacyProduct(tx, {
          branchId: disposableBranchId,
          productCode: d.productCode,
        });
        if (!ensured.ok) {
          throw new Error(`ENSURE_FAILED:${ensured.error}`);
        }
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
        include: {
          category: { select: { id: true, name: true } },
          subtests: {
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
          parentTest: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json(test);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    if (e instanceof Error && e.message.startsWith("ENSURE_FAILED:")) {
      return NextResponse.json({ error: e.message.replace(/^ENSURE_FAILED:/, "") }, { status: 400 });
    }
    console.error("Create lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
