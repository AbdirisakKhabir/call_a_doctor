import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { computeIncomeStatement } from "@/lib/financial-income-statement";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok =
      (await userHasPermission(auth.userId, "financial.view")) ||
      (await userHasPermission(auth.userId, "accounts.reports"));
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }

    const incomeStatement = await computeIncomeStatement(prisma, dateFilter);

    return NextResponse.json({
      incomeStatement,
      dateRange: { from: from ?? null, to: to ?? null },
    });
  } catch (e) {
    console.error("Financial reports error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
