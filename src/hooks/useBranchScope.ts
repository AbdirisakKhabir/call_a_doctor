"use client";

import { useAuth } from "@/context/AuthContext";

/**
 * Branch access from Settings → Branches & access (UserBranch).
 * - `branchIds == null` → user has no row restrictions: may work with all active branches (admin-style).
 * - `branchIds` is a non-empty array → restricted to those branches only.
 */
export function useBranchScope() {
  const { user } = useAuth();
  const branchIds = user?.branchIds;

  const seesAllBranches = branchIds == null;
  const assignedBranchIds = Array.isArray(branchIds) ? branchIds : null;
  const singleAssignedBranchId =
    Array.isArray(branchIds) && branchIds.length === 1 ? branchIds[0] : null;
  const hasMultipleAssignedBranches =
    Array.isArray(branchIds) && branchIds.length > 1;

  const allBranchesLabel = seesAllBranches ? "All branches" : "All my branches";

  return {
    seesAllBranches,
    assignedBranchIds,
    singleAssignedBranchId,
    hasMultipleAssignedBranches,
    allBranchesLabel,
  };
}
