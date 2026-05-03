import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";
import { buildServiceConsumeReport } from "@/lib/reports/service-consume-report";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branchIdParam = searchParams.get("branchId");

    if (!from || !to) {
      return NextResponse.json({ error: "Query parameters from and to (YYYY-MM-DD) are required." }, { status: 400 });
    }

    const dateFilter: { gte: Date; lte: Date } = {
      gte: new Date(from),
      lte: (() => {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        return end;
      })(),
    };

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    let branchId: number | undefined;
    if (branchIdParam && branchIdParam !== "") {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      branchId = bid;
    } else if (branchFilter && branchFilter.length === 1) {
      branchId = branchFilter[0];
    }

    const branchScope =
      branchId != null
        ? { branchId }
        : branchFilter && branchFilter.length > 0
          ? { branchId: { in: branchFilter } }
          : ({} as Record<string, never>);

    const payload = await buildServiceConsumeReport(prisma, {
      from,
      to,
      dateFilter,
      branchId: branchId ?? null,
      branchScope,
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error("Services disposables report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
