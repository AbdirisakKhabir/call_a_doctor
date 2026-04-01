import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveBranchAccess } from "@/lib/pharmacy-branch";

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

    const q = searchParams.get("q") || "";
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));

    const baseWhere = {
      branchId,
      isActive: true,
      forSale: true,
      quantity: { gt: 0 },
    };

    if (!q.trim()) {
      const products = await prisma.product.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          code: true,
          imageUrl: true,
          sellingPrice: true,
          quantity: true,
          unit: true,
          expiryDate: true,
        },
        orderBy: { name: "asc" },
        take: limit,
      });
      return NextResponse.json(products);
    }

    const products = await prisma.product.findMany({
      where: {
        ...baseWhere,
        OR: [{ name: { contains: q } }, { code: { contains: q } }],
      },
      select: {
        id: true,
        name: true,
        code: true,
        imageUrl: true,
        sellingPrice: true,
        quantity: true,
        unit: true,
        expiryDate: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });
    return NextResponse.json(products);
  } catch (e) {
    console.error("Product search error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
