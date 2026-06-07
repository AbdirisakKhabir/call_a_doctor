import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";
import { isUnsellableReason, UNSELLABLE_REASONS } from "@/lib/unsellable-stock";

/** List unsellable movement logs or current non-sellable balances per product. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "pharmacy.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const list = searchParams.get("list") || "logs"; // logs | balances
    const branchIdParam = searchParams.get("branchId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const listScope = await getPharmacyReportListBranchScope(auth.userId);

    if (list === "balances") {
      const whereBal: { branchId?: number | { in: number[] }; unsellableQuantity: { gt: number } } = {
        unsellableQuantity: { gt: 0 },
      };
      if (listScope !== "all") {
        whereBal.branchId = { in: listScope };
      }
      if (branchIdParam) {
        const bid = Number(branchIdParam);
        if (!Number.isInteger(bid) || bid <= 0) {
          return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
        }
        if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        whereBal.branchId = bid;
      }

      const products = await prisma.product.findMany({
        where: whereBal,
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          quantity: true,
          unsellableQuantity: true,
          expiryDate: true,
          forSale: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: [{ branchId: "asc" }, { name: "asc" }],
        take: 2000,
      });
      return NextResponse.json({ balances: products });
    }

    const whereLog: Prisma.UnsellableStockLogWhereInput = {};
    if (listScope !== "all") {
      whereLog.branchId = { in: listScope };
    }
    if (branchIdParam) {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
      }
      if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      whereLog.branchId = bid;
    }

    const include = {
      product: { select: { id: true, name: true, code: true, unit: true } },
      branch: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    };

    if (paginate) {
      const [logs, total] = await Promise.all([
        prisma.unsellableStockLog.findMany({
          where: whereLog,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.unsellableStockLog.count({ where: whereLog }),
      ]);
      return NextResponse.json({ data: logs, total, page, pageSize });
    }

    const logs = await prisma.unsellableStockLog.findMany({
      where: whereLog,
      include,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json(logs);
  } catch (e) {
    console.error("Unsellable stock GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** Move quantity from sellable stock to unsellable (non-sellable) inventory. */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "pharmacy.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const productId = Number(body.productId);
    const qty = Math.floor(Number(body.quantity));
    const branchId = Number(body.branchId);
    const reasonRaw = typeof body.reason === "string" ? body.reason.trim().toLowerCase() : "";
    const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) : "";

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Valid product id is required" }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive whole number" }, { status: 400 });
    }
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }
    if (!isUnsellableReason(reasonRaw)) {
      return NextResponse.json(
        { error: `Reason must be one of: ${UNSELLABLE_REASONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!(await userCanTransactInventoryAtBranch(auth.userId, branchId))) {
      return NextResponse.json({ error: "You are not allowed to adjust inventory for this branch" }, { status: 403 });
    }

    const log = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, branchId, isActive: true },
        select: { id: true, quantity: true },
      });
      if (!product) {
        throw new Error("NOT_FOUND");
      }
      if (product.quantity < qty) {
        throw new Error("INSUFFICIENT");
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          quantity: { decrement: qty },
          unsellableQuantity: { increment: qty },
        },
      });

      return tx.unsellableStockLog.create({
        data: {
          productId: product.id,
          branchId,
          quantity: qty,
          reason: reasonRaw,
          notes: notes || null,
          createdById: auth.userId,
        },
        include: {
          product: { select: { id: true, name: true, code: true, unit: true } },
          branch: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "pharmacy.unsellable_stock.move",
      module: "pharmacy",
      resourceType: "UnsellableStockLog",
      resourceId: log.id,
      metadata: { branchId, productId, quantity: qty, reason: reasonRaw },
    });

    return NextResponse.json(log);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Product not found at this branch" }, { status: 404 });
    }
    if (msg === "INSUFFICIENT") {
      return NextResponse.json({ error: "Insufficient sellable quantity" }, { status: 400 });
    }
    console.error("Unsellable stock POST error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
