import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveBranchAccess } from "@/lib/pharmacy-branch";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";
import { replaceProductSaleUnits, validateSaleUnitsPayload, type SaleUnitInput } from "@/lib/product-sale-units";
import { computeBaseQuantityFromPackagingLines } from "@/lib/product-quantity-lines";

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

    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const stockType = searchParams.get("stockType") || "all"; // all | sale | internal
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const stockFilter =
      stockType === "sale" ? { forSale: true } : stockType === "internal" ? { forSale: false } : {};

    const where = {
      branchId,
      ...stockFilter,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { code: { contains: search } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
    };

    const include = {
      category: { select: { id: true, name: true } },
      saleUnits: { orderBy: { sortOrder: "asc" as const } },
    };

    if (paginate) {
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.product.count({ where }),
      ]);
      return NextResponse.json({ data: products, total, page, pageSize });
    }

    const products = await prisma.product.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
  } catch (e) {
    console.error("Products list error:", e);
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
    const {
      branchId: bodyBranchId,
      name,
      code,
      description,
      imageUrl,
      imagePublicId,
      costPrice,
      sellingPrice,
      quantity,
      unit,
      categoryId,
      forSale,
      internalPurpose,
      expiryDate,
      saleUnits: saleUnitsRaw,
      quantityLines: quantityLinesRaw,
    } = body;

    const resolved = await requireActiveBranchAccess(auth.userId, bodyBranchId);
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Product code is required" }, { status: 400 });
    }

    const codeNorm = String(code).trim().toUpperCase();
    const existing = await prisma.product.findUnique({
      where: { branchId_code: { branchId, code: codeNorm } },
    });
    if (existing) {
      return NextResponse.json({ error: "Product with this code already exists at this branch" }, { status: 400 });
    }

    let categoryIdVal: number | null = null;
    if (categoryId != null && categoryId !== "") {
      const cid = Number(categoryId);
      if (Number.isInteger(cid) && cid > 0) {
        const cat = await prisma.category.findFirst({
          where: { id: cid, branchId },
        });
        if (!cat) {
          return NextResponse.json({ error: "Category does not belong to this branch" }, { status: 400 });
        }
        categoryIdVal = cid;
      }
    }

    let expiryDateVal: Date | null = null;
    if (expiryDate !== undefined && expiryDate !== null && expiryDate !== "") {
      const d = new Date(String(expiryDate));
      if (!Number.isNaN(d.getTime())) expiryDateVal = d;
    }

    const saleFlag = typeof forSale === "boolean" ? forSale : true;
    const purposeRaw = typeof internalPurpose === "string" ? internalPurpose.trim().toLowerCase() : "";
    const allowedPurposes = ["laboratory", "cleaning", "general"];
    if (!saleFlag && !allowedPurposes.includes(purposeRaw)) {
      return NextResponse.json(
        { error: "Internal supplies require a purpose: laboratory, cleaning, or general" },
        { status: 400 }
      );
    }

    const baseLabel = unit ? String(unit).trim() : "Unit";
    let saleUnitRows: SaleUnitInput[];
    if (Array.isArray(saleUnitsRaw) && saleUnitsRaw.length > 0) {
      const v = validateSaleUnitsPayload(saleUnitsRaw as SaleUnitInput[]);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      saleUnitRows = v.rows;
    } else {
      saleUnitRows = [
        {
          unitKey: "base",
          label: baseLabel === "pcs" ? "Unit" : baseLabel.slice(0, 191),
          baseUnitsEach: 1,
          sortOrder: 0,
        },
      ];
    }

    let initialQty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (Array.isArray(quantityLinesRaw) && quantityLinesRaw.length > 0) {
      const lines = quantityLinesRaw
        .filter((x: unknown) => x && typeof x === "object")
        .map((x: { unitKey?: unknown; quantity?: unknown }) => ({
          unitKey: String((x as { unitKey?: string }).unitKey ?? ""),
          quantity: Number((x as { quantity?: number }).quantity),
        }));
      const conv = computeBaseQuantityFromPackagingLines(lines, saleUnitRows);
      if (!conv.ok) {
        return NextResponse.json({ error: conv.error }, { status: 400 });
      }
      initialQty = conv.base;
    }

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          branchId,
          name: String(name).trim(),
          code: codeNorm,
          description: description ? String(description).trim() : null,
          imageUrl: imageUrl || null,
          imagePublicId: imagePublicId || null,
          costPrice: Number(costPrice) || 0,
          sellingPrice: Number(sellingPrice) || 0,
          quantity: initialQty,
          unit: unit ? String(unit).trim() : "pcs",
          expiryDate: expiryDateVal,
          categoryId: categoryIdVal,
          forSale: saleFlag,
          internalPurpose: saleFlag ? null : purposeRaw,
        },
      });
      await replaceProductSaleUnits(tx, p.id, saleUnitRows);
      return tx.product.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          category: { select: { id: true, name: true } },
          saleUnits: { orderBy: { sortOrder: "asc" } },
        },
      });
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.product.create",
      module: "pharmacy",
      resourceType: "Product",
      resourceId: product.id,
      metadata: { branchId, code: product.code },
    });
    return NextResponse.json(product);
  } catch (e) {
    console.error("Create product error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
