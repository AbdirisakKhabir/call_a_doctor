import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";

/**
 * Return stock from an outreach team bag back to pharmacy shelf.
 * Restores pharmacy quantity, reduces team inventory, and reduces team credit (AR) by return value.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await userHasPermission(auth.userId, "pharmacy.pos"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { teamId, branchId, notes, items } = body;

    const bid = Number(branchId);
    const tid = Number(teamId);
    if (!Number.isInteger(bid) || !Number.isInteger(tid)) {
      return NextResponse.json({ error: "branchId and teamId are required" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
    }

    const team = await prisma.outreachTeam.findFirst({
      where: { id: tid, branchId: bid, isActive: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Invalid outreach team for this branch" }, { status: 400 });
    }

    type Line = { productId: number; quantity: number; unitPrice: number; totalAmount: number };
    const lines: Line[] = [];
    let totalAmount = 0;

    for (const it of items) {
      const productId = Number(it.productId);
      const quantity = Math.max(1, Math.floor(Number(it.quantity) || 0));
      if (!Number.isInteger(productId) || productId <= 0) continue;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, branchId: true, sellingPrice: true, forSale: true },
      });
      if (!product || product.branchId !== bid) {
        return NextResponse.json(
          { error: `Product ${productId} does not belong to this branch` },
          { status: 400 }
        );
      }
      if (!product.forSale) {
        return NextResponse.json(
          { error: "Cannot return internal (non-sale) products through this flow" },
          { status: 400 }
        );
      }

      const inv = await prisma.outreachInventoryItem.findUnique({
        where: { teamId_productId: { teamId: tid, productId } },
      });
      if (!inv || inv.quantity < quantity) {
        return NextResponse.json(
          {
            error: `Insufficient outreach stock for product ID ${productId} (have ${inv?.quantity ?? 0}, need ${quantity})`,
          },
          { status: 400 }
        );
      }

      const unitPrice = product.sellingPrice;
      const lineTotal = quantity * unitPrice;
      lines.push({ productId, quantity, unitPrice, totalAmount: lineTotal });
      totalAmount += lineTotal;
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: "No valid line items" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const ret = await tx.outreachReturn.create({
        data: {
          teamId: tid,
          branchId: bid,
          totalAmount,
          notes: notes ? String(notes).trim() : null,
          createdById: auth.userId,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              totalAmount: l.totalAmount,
            })),
          },
        },
      });

      for (const l of lines) {
        await tx.outreachInventoryItem.update({
          where: { teamId_productId: { teamId: tid, productId: l.productId } },
          data: { quantity: { decrement: l.quantity } },
        });
        await tx.product.update({
          where: { id: l.productId },
          data: { quantity: { increment: l.quantity } },
        });
      }

      await tx.outreachInventoryItem.deleteMany({
        where: { teamId: tid, quantity: { lte: 0 } },
      });

      const updatedTeam = await tx.outreachTeam.update({
        where: { id: tid },
        data: {
          creditBalance: { decrement: totalAmount },
        },
        select: { id: true, creditBalance: true },
      });

      if (updatedTeam.creditBalance < 0) {
        await tx.outreachTeam.update({
          where: { id: tid },
          data: { creditBalance: 0 },
        });
      }

      return tx.outreachReturn.findUnique({
        where: { id: ret.id },
        include: {
          items: { include: { product: { select: { id: true, name: true, code: true } } } },
          team: { select: { id: true, name: true, creditBalance: true } },
        },
      });
    });

    return NextResponse.json(created);
  } catch (e) {
    console.error("Outreach return error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
