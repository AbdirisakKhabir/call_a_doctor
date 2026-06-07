import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { pharmacyProductMetaByNormalizedCodes } from "@/lib/pharmacy-product-meta-by-codes";
import { normalizeSaleUnitKey } from "@/lib/product-sale-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const serviceId = Number(id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return NextResponse.json({ error: "Invalid service id" }, { status: 400 });
    }
    const service = await prisma.service.findFirst({ where: { id: serviceId } });
    if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const branchIdRaw = searchParams.get("branchId");
    const branchId = branchIdRaw ? Number(branchIdRaw) : NaN;

    const rows = await prisma.serviceDisposable.findMany({
      where: { serviceId },
      orderBy: { productCode: "asc" },
    });

    const hasBranch = Number.isInteger(branchId) && branchId > 0;
    const codes = rows.map((r) => normalizeProductCode(r.productCode));
    const codeUniq = [...new Set(codes)];

    const pharmacyByCode =
      hasBranch && codeUniq.length > 0
        ? await pharmacyProductMetaByNormalizedCodes(branchId!, codeUniq)
        : new Map<string, { name: string; unit: string }>();

    const products =
      hasBranch && codeUniq.length > 0
        ? await prisma.product.findMany({
            where: { branchId: branchId!, isActive: true, code: { in: codeUniq } },
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              saleUnits: {
                orderBy: { sortOrder: "asc" },
                select: { unitKey: true, label: true, baseUnitsEach: true },
              },
            },
          })
        : [];

    const productByNormCode = new Map(
      products.map((p) => [normalizeProductCode(p.code), p] as const)
    );

    const enriched = rows.map((r) => {
      const code = normalizeProductCode(r.productCode);
      const rx = pharmacyByCode.get(code);
      const prod = productByNormCode.get(code);
      const ukey = normalizeSaleUnitKey(r.deductionUnitKey);
      const unitPick = prod?.saleUnits.find((u) => normalizeSaleUnitKey(u.unitKey) === ukey);
      return {
        id: r.id,
        serviceId: r.serviceId,
        productCode: r.productCode,
        unitsPerService: r.unitsPerService,
        deductionUnitKey: r.deductionUnitKey,
        deductionUnitLabel: unitPick?.label ?? ukey,
        saleUnits: prod?.saleUnits ?? [],
        productName: prod?.name ?? rx?.name ?? null,
        stockUnit: prod?.unit ?? rx?.unit ?? null,
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    console.error("Service disposables GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const serviceId = Number(id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return NextResponse.json({ error: "Invalid service id" }, { status: 400 });
    }
    const service = await prisma.service.findFirst({ where: { id: serviceId } });
    if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const productCode = typeof body.productCode === "string" ? normalizeProductCode(body.productCode) : "";
    const unitsPerService = Number(body.unitsPerService);
    const deductionUnitKey = normalizeSaleUnitKey(
      typeof body.deductionUnitKey === "string" ? body.deductionUnitKey : "base"
    );
    if (!productCode) {
      return NextResponse.json({ error: "Product code is required" }, { status: 400 });
    }
    if (!Number.isFinite(unitsPerService) || unitsPerService <= 0) {
      return NextResponse.json({ error: "Units per service must be a positive number" }, { status: 400 });
    }

    const row = await prisma.serviceDisposable.create({
      data: {
        serviceId,
        productCode,
        unitsPerService,
        deductionUnitKey,
      },
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "This product code is already linked to this service" }, { status: 400 });
    }
    console.error("Service disposables POST error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
