import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { lineQuantityToBaseUnits } from "@/lib/product-packaging";
import { getSaleUnitForProduct } from "@/lib/product-sale-units";
import { logAuditFromRequest } from "@/lib/audit-log";

/**
 * GET ?saleId= — quantities already returned per sale line (for UI limits).
 * GET ?branchId=&from=&to= — list sale returns (optional pagination later).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const saleIdParam = searchParams.get("saleId");
    const branchIdParam = searchParams.get("branchId");

    if (saleIdParam) {
      const saleId = Number(saleIdParam);
      if (!Number.isInteger(saleId)) {
        return NextResponse.json({ error: "Invalid sale id" }, { status: 400 });
      }
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        select: { branchId: true },
      });
      if (!sale || sale.branchId == null) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      }
      if (!(await userCanTransactInventoryAtBranch(auth.userId, sale.branchId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const lines = await prisma.pharmacySaleReturnItem.findMany({
        where: { saleItem: { saleId } },
        select: { saleItemId: true, quantity: true },
      });
      const returnedBySaleItemId: Record<number, number> = {};
      for (const l of lines) {
        returnedBySaleItemId[l.saleItemId] =
          (returnedBySaleItemId[l.saleItemId] || 0) + l.quantity;
      }
      return NextResponse.json({ returnedBySaleItemId });
    }

    if (branchIdParam) {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid)) {
        return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
      }
      if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const listScope = await getPharmacyReportListBranchScope(auth.userId);
      if (listScope !== "all" && !listScope.includes(bid)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const from = searchParams.get("from");
      const to = searchParams.get("to");
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      const hasDate = Object.keys(dateFilter).length > 0;

      const rows = await prisma.pharmacySaleReturn.findMany({
        where: {
          branchId: bid,
          ...(hasDate ? { returnDate: dateFilter } : {}),
        },
        include: {
          sale: { select: { id: true, totalAmount: true, saleDate: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              saleItem: {
                include: {
                  product: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
        },
        orderBy: { returnDate: "desc" },
        take: 200,
      });
      return NextResponse.json(rows);
    }

    return NextResponse.json(
      { error: "Provide saleId or branchId" },
      { status: 400 }
    );
  } catch (e) {
    console.error("Sale returns GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * Record a return against a retail pharmacy sale — increments shelf inventory.
 * Not for outreach bag sales (use outreach return).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await userHasPermission(auth.userId, "pharmacy.pos"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { saleId, notes, items } = body;

    const sid = Number(saleId);
    if (!Number.isInteger(sid)) {
      return NextResponse.json({ error: "saleId is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: sid },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                branchId: true,
                forSale: true,
              },
            },
          },
        },
      },
    });

    if (!sale || sale.branchId == null) {
      return NextResponse.json({ error: "Sale not found or has no branch" }, { status: 400 });
    }

    if (sale.kind === "appointment") {
      return NextResponse.json(
        {
          error: "Visit billing sales (services) cannot be returned as pharmacy stock.",
        },
        { status: 400 }
      );
    }

    if (sale.outreachTeamId != null || sale.customerType === "outreach") {
      return NextResponse.json(
        {
          error:
            "This sale is an outreach transfer. Use Outreach → Return stock to pharmacy instead.",
        },
        { status: 400 }
      );
    }

    if (!(await userCanTransactInventoryAtBranch(auth.userId, sale.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bid = sale.branchId;

    const priorReturnLines = await prisma.pharmacySaleReturnItem.findMany({
      where: { saleItem: { saleId: sid } },
      select: { saleItemId: true, quantity: true },
    });
    const alreadyReturned: Record<number, number> = {};
    for (const l of priorReturnLines) {
      alreadyReturned[l.saleItemId] = (alreadyReturned[l.saleItemId] || 0) + l.quantity;
    }

    type Line = { saleItemId: number; quantity: number; unitPrice: number; totalAmount: number };
    const lines: Line[] = [];
    let totalAmount = 0;

    for (const it of items) {
      const saleItemId = Number(it.saleItemId);
      const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
      if (!Number.isInteger(saleItemId) || saleItemId <= 0 || qty <= 0) continue;

      const saleItem = sale.items.find((i) => i.id === saleItemId);
      if (!saleItem) {
        return NextResponse.json(
          { error: `Sale line ${saleItemId} does not belong to this sale` },
          { status: 400 }
        );
      }
      if (!saleItem.product || saleItem.productId == null) {
        return NextResponse.json(
          { error: "This line is not a retail product and cannot be returned to shelf stock." },
          { status: 400 }
        );
      }
      if (saleItem.product.branchId !== bid) {
        return NextResponse.json({ error: "Product branch mismatch" }, { status: 400 });
      }
      if (!saleItem.product.forSale) {
        return NextResponse.json(
          { error: "This product is not a retail sale item" },
          { status: 400 }
        );
      }

      const prev = alreadyReturned[saleItemId] || 0;
      const remaining = saleItem.quantity - prev;
      if (qty > remaining) {
        return NextResponse.json(
          {
            error: `Cannot return ${qty} of line ${saleItemId}; only ${remaining} unit(s) left to return.`,
          },
          { status: 400 }
        );
      }

      const unitPrice = saleItem.unitPrice;
      const lineTotal = qty * unitPrice;
      lines.push({ saleItemId, quantity: qty, unitPrice, totalAmount: lineTotal });
      totalAmount += lineTotal;
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: "No valid return lines" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const ret = await tx.pharmacySaleReturn.create({
        data: {
          branchId: bid,
          saleId: sid,
          totalAmount,
          notes: notes ? String(notes).trim() : null,
          createdById: auth.userId,
          items: {
            create: lines.map((l) => ({
              saleItemId: l.saleItemId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              totalAmount: l.totalAmount,
            })),
          },
        },
      });

      for (const l of lines) {
        const saleItem = sale.items.find((i) => i.id === l.saleItemId)!;
        const pid = saleItem.productId;
        if (pid == null) continue;
        const su = await getSaleUnitForProduct(tx, pid, saleItem.saleUnit);
        const each = su?.baseUnitsEach ?? 1;
        const baseAdd = lineQuantityToBaseUnits(l.quantity, each);
        await tx.product.update({
          where: { id: pid },
          data: { quantity: { increment: baseAdd } },
        });
      }

      return tx.pharmacySaleReturn.findUnique({
        where: { id: ret.id },
        include: {
          items: {
            include: {
              saleItem: {
                include: {
                  product: { select: { id: true, name: true, code: true } },
                },
              },
            },
          },
          sale: { select: { id: true, saleDate: true } },
        },
      });
    });

    if (created) {
      await logAuditFromRequest(req, {
        userId: auth.userId,
        action: "pharmacy.sale_return.create",
        module: "pharmacy",
        resourceType: "SaleReturn",
        resourceId: created.id,
        metadata: { saleId: sid },
      });
    }
    return NextResponse.json(created);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("This product")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("Sale return POST error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
