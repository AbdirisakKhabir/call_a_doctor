import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export type VisitCardAccess = {
  doctorId: number | null;
  viewAll: boolean;
  viewOwn: boolean;
  canCreate: boolean;
  canEdit: boolean;
};

export async function getVisitCardAccess(userId: number): Promise<VisitCardAccess> {
  const [user, viewAll, viewOwn, canCreate, canEdit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { doctorProfile: { select: { id: true } } },
    }),
    userHasPermission(userId, "visit_cards.view_all"),
    userHasPermission(userId, "visit_cards.view_own"),
    userHasPermission(userId, "visit_cards.create"),
    userHasPermission(userId, "visit_cards.edit"),
  ]);

  return {
    doctorId: user?.doctorProfile?.id ?? null,
    viewAll,
    viewOwn,
    canCreate,
    canEdit,
  };
}

/** Allowed branch ids for user; null = all branches. */
export async function getUserBranchIdFilter(userId: number): Promise<number[] | null> {
  const rows = await prisma.userBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });
  if (rows.length === 0) return null;
  return rows.map((r) => r.branchId);
}

export function canListVisitCards(a: VisitCardAccess): boolean {
  return a.viewAll || a.viewOwn || a.canCreate;
}

export function canSeeVisitCardRow(
  a: VisitCardAccess,
  rowDoctorId: number
): boolean {
  if (a.viewAll) return true;
  if (a.viewOwn && a.doctorId != null && rowDoctorId === a.doctorId) return true;
  return false;
}
