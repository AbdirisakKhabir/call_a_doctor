import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

const BAL_GT = 0.009;

async function canViewReport(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "accounts.deposit")) ||
    (await userHasPermission(userId, "pharmacy.pos")) ||
    (await userHasPermission(userId, "patients.view"))
  );
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canViewReport(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const branchIdParam = req.nextUrl.searchParams.get("branchId");
    const branchFilter = await getUserBranchIdFilter(auth.userId);

    let registeredBranchId: number | Prisma.IntFilter | null | undefined;

    if (branchIdParam != null && branchIdParam.trim() !== "") {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      registeredBranchId = bid;
    } else if (branchFilter && branchFilter.length === 1) {
      registeredBranchId = branchFilter[0];
    } else if (branchFilter && branchFilter.length > 1) {
      registeredBranchId = { in: branchFilter };
    }

    const baseWhere: Prisma.PatientWhereInput = {
      isActive: true,
      accountBalance: { gt: BAL_GT },
      ...(registeredBranchId != null ? { registeredBranchId } : {}),
    };

    const [rows, agg] = await Promise.all([
      prisma.patient.findMany({
        where: baseWhere,
        include: {
          city: { select: { id: true, name: true } },
          village: { select: { id: true, name: true } },
          registeredBranch: { select: { id: true, name: true } },
        },
        orderBy: [{ accountBalance: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.patient.aggregate({
        where: baseWhere,
        _sum: { accountBalance: true },
        _count: true,
      }),
    ]);

    const totalOutstanding = roundMoney(agg._sum.accountBalance ?? 0);

    return NextResponse.json({
      patients: rows.map((p) => serializePatient(p)),
      count: agg._count,
      totalOutstanding,
    });
  } catch (e) {
    console.error("Outstanding balances report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
