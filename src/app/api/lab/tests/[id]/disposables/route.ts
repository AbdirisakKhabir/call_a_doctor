import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { pharmacyProductMetaByNormalizedCodes } from "@/lib/pharmacy-product-meta-by-codes";
import {
  ensureLabPackagingUnitsFromPharmacyProduct,
  mergeLabUnitsWithPharmacySaleUnits,
  normalizeLabUnitKey,
} from "@/lib/lab-inventory-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const labTestId = Number(id);
    if (!Number.isInteger(labTestId) || labTestId <= 0) {
      return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
    }
    const test = await prisma.labTest.findFirst({ where: { id: labTestId } });
    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const branchIdRaw = searchParams.get("branchId");
    const branchId = branchIdRaw ? Number(branchIdRaw) : NaN;

    const rows = await prisma.labTestDisposable.findMany({
      where: { labTestId },
      orderBy: { productCode: "asc" },
    });

    const hasBranch = Number.isInteger(branchId) && branchId > 0;
    const codes = rows.map((r) => normalizeProductCode(r.productCode));

    const codeUniq = [...new Set(codes)];

    const [labByCode, pharmacyByCode, productsWithSaleUnits] = await Promise.all([
      hasBranch && codeUniq.length > 0
        ? prisma.labInventoryItem
            .findMany({
              where: { branchId: branchId!, code: { in: codeUniq } },
              select: {
                code: true,
                name: true,
                unit: true,
                labUnits: {
                  orderBy: { sortOrder: "asc" },
                  select: { unitKey: true, label: true, baseUnitsEach: true, sortOrder: true },
                },
              },
            })
            .then((list) => {
              const m = new Map<
                string,
                {
                  name: string;
                  unit: string;
                  labUnits: {
                    unitKey: string;
                    label: string;
                    baseUnitsEach: number;
                    sortOrder: number;
                  }[];
                }
              >();
              for (const it of list) {
                m.set(normalizeProductCode(it.code), {
                  name: it.name,
                  unit: it.unit || "pcs",
                  labUnits: it.labUnits.map((u) => ({
                    unitKey: u.unitKey,
                    label: u.label,
                    baseUnitsEach: u.baseUnitsEach,
                    sortOrder: u.sortOrder,
                  })),
                });
              }
              return m;
            })
        : Promise.resolve(
            new Map<
              string,
              {
                name: string;
                unit: string;
                labUnits: {
                  unitKey: string;
                  label: string;
                  baseUnitsEach: number;
                  sortOrder: number;
                }[];
              }
            >()
          ),
      hasBranch && codeUniq.length > 0
        ? pharmacyProductMetaByNormalizedCodes(branchId!, codeUniq)
        : Promise.resolve(new Map<string, { name: string; unit: string }>()),
      hasBranch && codeUniq.length > 0
        ? prisma.product.findMany({
            where: { branchId: branchId!, isActive: true, code: { in: codeUniq } },
            select: {
              code: true,
              saleUnits: {
                orderBy: { sortOrder: "asc" },
                select: { unitKey: true, label: true, baseUnitsEach: true, sortOrder: true },
              },
            },
          })
        : Promise.resolve([] as { code: string; saleUnits: { unitKey: string; label: string; baseUnitsEach: number; sortOrder: number }[] }[]),
    ]);

    const pharmacySaleUnitsByCode = new Map(
      productsWithSaleUnits.map((p) => [normalizeProductCode(p.code), p.saleUnits] as const)
    );

    const enriched = rows.map((r) => {
      const code = normalizeProductCode(r.productCode);
      const lab = labByCode.get(code);
      const rx = pharmacyByCode.get(code);
      const ukey = normalizeLabUnitKey(r.deductionUnitKey);
      const labUnitsMerged = mergeLabUnitsWithPharmacySaleUnits(
        lab?.labUnits ?? [],
        pharmacySaleUnitsByCode.get(code) ?? []
      );
      const unitPick = labUnitsMerged.find((u) => u.unitKey === ukey);
      return {
        id: r.id,
        labTestId: r.labTestId,
        productCode: r.productCode,
        unitsPerTest: r.unitsPerTest,
        deductionUnitKey: r.deductionUnitKey,
        deductionUnitLabel: unitPick?.label ?? ukey,
        labUnits: labUnitsMerged,
        productName: lab?.name ?? rx?.name ?? null,
        stockUnit: lab?.unit ?? rx?.unit ?? null,
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    console.error("Lab test disposables GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.create")) && !(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const labTestId = Number(id);
    if (!Number.isInteger(labTestId) || labTestId <= 0) {
      return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
    }
    const test = await prisma.labTest.findFirst({ where: { id: labTestId } });
    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const productCode = typeof body.productCode === "string" ? normalizeProductCode(body.productCode) : "";
    const unitsPerTest = Number(body.unitsPerTest);
    const deductionUnitKey = normalizeLabUnitKey(
      typeof body.deductionUnitKey === "string" ? body.deductionUnitKey : "base"
    );
    const branchId = body.branchId != null ? Number(body.branchId) : NaN;
    if (!productCode) {
      return NextResponse.json({ error: "Product code is required" }, { status: 400 });
    }
    if (!Number.isFinite(unitsPerTest) || unitsPerTest <= 0) {
      return NextResponse.json({ error: "Units per test must be a positive number" }, { status: 400 });
    }
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "branchId is required for lab disposables" }, { status: 400 });
    }

    const row = await prisma.$transaction(async (tx) => {
      const ensured = await ensureLabPackagingUnitsFromPharmacyProduct(tx, { branchId, productCode });
      if (!ensured.ok) {
        throw new Error(`ENSURE_FAILED:${ensured.error}`);
      }
      return tx.labTestDisposable.create({
        data: {
          labTestId,
          productCode,
          unitsPerTest,
          deductionUnitKey,
        },
      });
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith("ENSURE_FAILED:")) {
      return NextResponse.json({ error: e.message.replace(/^ENSURE_FAILED:/, "") }, { status: 400 });
    }
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "This product code is already linked to this test" }, { status: 400 });
    }
    console.error("Lab test disposables POST error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
