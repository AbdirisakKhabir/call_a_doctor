import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";

/** Validates branch exists, is active, and user may post inventory there (including admins allocating to any branch). */
export async function requireActiveBranchAccess(
  userId: number,
  rawBranchId: unknown
): Promise<{ branchId: number } | NextResponse> {
  const bid =
    rawBranchId != null && rawBranchId !== "" ? Number(rawBranchId) : NaN;
  if (!Number.isInteger(bid) || bid <= 0) {
    return NextResponse.json({ error: "Valid branchId is required" }, { status: 400 });
  }
  const branchRow = await prisma.branch.findFirst({
    where: { id: bid, isActive: true },
    select: { id: true },
  });
  if (!branchRow) {
    return NextResponse.json({ error: "Invalid or inactive branch" }, { status: 400 });
  }
  if (!(await userCanTransactInventoryAtBranch(userId, bid))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { branchId: bid };
}
