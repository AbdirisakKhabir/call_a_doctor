import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.deposit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sales = await prisma.sale.findMany({
      where: { depositTransaction: null },
      orderBy: { saleDate: "desc" },
      take: 200,
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(sales);
  } catch (e) {
    console.error("Undeposited sales error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
