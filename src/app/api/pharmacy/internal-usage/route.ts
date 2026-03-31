import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";
import { parseSaleUnit, quantityInUnitToPcs } from "@/lib/product-packaging";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

const PURPOSES = ["laboratory", "cleaning", "general"] as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const listScope = await getPharmacyReportListBranchScope(auth.userId);
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branchIdParam = searchParams.get("branchId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const hasDate = Object.keys(dateFilter).length > 0;

    const where: {
      productId?: number;
      branchId?: number | { in: number[] } | null;
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      ...(productId ? { productId: Number(productId) } : {}),
      ...(hasDate ? { createdAt: dateFilter } : {}),
    };

    if (listScope !== "all") {
      where.branchId = { in: listScope };
    }

    if (branchIdParam) {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid)) {
        return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
      }
      if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.branchId = bid;
    }

    const include = {
      product: { select: { id: true, name: true, code: true, unit: true, internalPurpose: true } },
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    };

    if (paginate) {
      const [logs, total] = await Promise.all([
        prisma.internalStockLog.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.internalStockLog.count({ where }),
      ]);
      return NextResponse.json({ data: logs, total, page, pageSize });
    }

    const logs = await prisma.internalStockLog.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(logs);
  } catch (e) {
    console.error("Internal usage list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

type LineIn = { productId: unknown; quantity: unknown; unit?: unknown };

function mergeUsageLines(
  items: LineIn[],
  packagingById: Map<number, { boxesPerCarton: number | null; pcsPerBox: number | null }>
): { merged: Map<number, number> } | { error: string } {
  const merged = new Map<number, number>();
  for (const it of items) {
    const pid = Number(it.productId);
    const q = Math.max(1, Math.floor(Number(it.quantity) || 0));
    if (!Number.isInteger(pid) || pid <= 0) {
      return { error: "Each line needs a valid product and quantity" };
    }
    const pack = packagingById.get(pid);
    if (!pack) {
      return { error: `Product #${pid} not found` };
    }
    const conv = quantityInUnitToPcs(pack, q, parseSaleUnit(it.unit));
    if ("error" in conv) {
      return { error: conv.error };
    }
    merged.set(pid, (merged.get(pid) ?? 0) + conv.pcs);
  }
  return merged.size ? { merged } : { error: "Each line needs a valid product and quantity" };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, quantity, purpose, notes, branchId, items: itemsRaw } = body;

    const purposeStr = typeof purpose === "string" ? purpose.trim().toLowerCase() : "";
    if (!PURPOSES.includes(purposeStr as (typeof PURPOSES)[number])) {
      return NextResponse.json(
        { error: "Purpose must be laboratory, cleaning, or general" },
        { status: 400 }
      );
    }

    const bid = branchId != null && branchId !== "" ? Number(branchId) : NaN;
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json(
        { error: "You are not allowed to record internal usage for this branch" },
        { status: 403 }
      );
    }

    const lines: LineIn[] =
      Array.isArray(itemsRaw) && itemsRaw.length > 0
        ? (itemsRaw as LineIn[])
        : [{ productId, quantity, unit: (body as { unit?: unknown }).unit }];

    const productIds = [
      ...new Set(
        lines
          .map((x) => Number(x.productId))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ];
    if (productIds.length === 0) {
      return NextResponse.json({ error: "Each line needs a valid product and quantity" }, { status: 400 });
    }

    const packagingRows = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, boxesPerCarton: true, pcsPerBox: true },
    });
    const packagingById = new Map(
      packagingRows.map((r) => [
        r.id,
        { boxesPerCarton: r.boxesPerCarton, pcsPerBox: r.pcsPerBox },
      ])
    );

    const mergeResult = mergeUsageLines(lines, packagingById);
    if ("error" in mergeResult) {
      return NextResponse.json({ error: mergeResult.error }, { status: 400 });
    }
    const merged = mergeResult.merged;

    const notesTrimmed = notes ? String(notes).trim().slice(0, 500) : null;

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        quantity: true,
        forSale: true,
        isActive: true,
        branchId: true,
        boxesPerCarton: true,
        pcsPerBox: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const pid of merged.keys()) {
      const product = byId.get(pid);
      if (!product || !product.isActive) {
        return NextResponse.json({ error: `Product #${pid} not found` }, { status: 404 });
      }
      if (product.branchId !== bid) {
        return NextResponse.json(
          {
            error:
              "One or more products are not stocked at the selected branch. Choose the branch that holds those items.",
          },
          { status: 400 }
        );
      }
      if (product.forSale) {
        return NextResponse.json(
          {
            error:
              "One or more products are for retail sale. Use POS for sales, or mark them as internal (non-sale) in inventory.",
          },
          { status: 400 }
        );
      }
      const qty = merged.get(pid)!;
      if (product.quantity < qty) {
        return NextResponse.json(
          { error: `Insufficient stock for product #${pid}` },
          { status: 400 }
        );
      }
    }

    const logs = await prisma.$transaction(async (tx) => {
      const out: Awaited<ReturnType<typeof tx.internalStockLog.create>>[] = [];
      for (const [pid, qty] of merged!) {
        await tx.product.update({
          where: { id: pid },
          data: { quantity: { decrement: qty } },
        });
        const log = await tx.internalStockLog.create({
          data: {
            productId: pid,
            branchId: bid,
            quantity: qty,
            purpose: purposeStr,
            notes: notesTrimmed,
            createdById: auth.userId,
          },
          include: {
            product: { select: { id: true, name: true, code: true, unit: true, internalPurpose: true } },
            branch: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        });
        out.push(log);
      }
      return out;
    });

    return NextResponse.json({ logs });
  } catch (e) {
    console.error("Internal usage create error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
