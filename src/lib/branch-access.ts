import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

/** null = user may use all active branches; non-null = only these branch ids */
export async function getUserAllowedBranchIds(
  userId: number
): Promise<number[] | null> {
  const rows = await prisma.userBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });
  if (rows.length === 0) return null;
  return rows.map((r) => r.branchId);
}

export async function userCanAccessBranch(
  userId: number,
  branchId: number
): Promise<boolean> {
  const allowed = await getUserAllowedBranchIds(userId);
  if (allowed === null) return true;
  return allowed.includes(branchId);
}

/**
 * Sales and purchases may target a branch’s inventory.
 * Users with `settings.manage` may allocate to any active branch; others only to branches they’re assigned to.
 */
export async function userCanTransactInventoryAtBranch(
  userId: number,
  branchId: number
): Promise<boolean> {
  if (await userHasPermission(userId, "settings.manage")) {
    const b = await prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true },
    });
    return !!b;
  }
  return userCanAccessBranch(userId, branchId);
}

/**
 * Pharmacy report/list GET scope: which branches’ rows may appear when no `branchId` filter is applied.
 * Branch administrators (`settings.manage`) see all branches; others only their assignments (or all if none assigned).
 */
export async function getPharmacyReportListBranchScope(
  userId: number
): Promise<number[] | "all"> {
  if (await userHasPermission(userId, "settings.manage")) return "all";
  const allowed = await getUserAllowedBranchIds(userId);
  if (allowed === null) return "all";
  return allowed;
}
