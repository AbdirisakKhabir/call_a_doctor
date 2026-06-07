import type { Prisma } from "@prisma/client";

/**
 * Validates assigning a test as a sub-test of a panel. Single-level only: parent must be top-level; a panel with children cannot become a sub-test.
 */
export async function assertLabTestParentAssignment(
  tx: Prisma.TransactionClient,
  opts: { testId?: number; parentTestId: number | null }
): Promise<string | null> {
  if (opts.parentTestId == null) return null;
  const pid = opts.parentTestId;
  if (opts.testId != null && pid === opts.testId) {
    return "A test cannot be its own panel parent.";
  }
  const parent = await tx.labTest.findUnique({
    where: { id: pid },
    select: { id: true, parentTestId: true },
  });
  if (!parent) return "Parent panel test not found.";
  if (parent.parentTestId != null) {
    return "Sub-tests can only be assigned to a top-level (panel) test.";
  }
  if (opts.testId != null) {
    const childCount = await tx.labTest.count({ where: { parentTestId: opts.testId } });
    if (childCount > 0) {
      return "Remove or reassign sub-tests under this test before marking it as a sub-test of another panel.";
    }
  }
  return null;
}
