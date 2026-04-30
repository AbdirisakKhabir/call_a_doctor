import type { Prisma } from "@prisma/client";
import {
  expandLabTestSelectionToOrderLines,
  type LabOrderLineInput,
  type LabTestExpandRow,
} from "@/lib/lab-order-expand-core";

export type { LabOrderLineInput, LabTestExpandRow };
export { expandLabTestSelectionToOrderLines };

export async function expandLabTestIdsToOrderLines(
  db: Prisma.TransactionClient,
  orderedUniqueTestIds: number[]
): Promise<{ lines: LabOrderLineInput[]; error?: string }> {
  if (orderedUniqueTestIds.length === 0) {
    return { lines: [], error: "At least one valid test is required" };
  }
  const tests = await db.labTest.findMany({
    where: { id: { in: orderedUniqueTestIds }, isActive: true },
    select: {
      id: true,
      parentTestId: true,
      price: true,
      subtests: {
        where: { isActive: true },
        select: { id: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (tests.length !== orderedUniqueTestIds.length) {
    return { lines: [], error: "One or more tests are invalid, inactive, or duplicated incorrectly" };
  }
  const rows: LabTestExpandRow[] = tests.map((t) => ({
    id: t.id,
    parentTestId: t.parentTestId,
    price: t.price,
    subtests: t.subtests.map((s) => ({ id: s.id })),
  }));
  return { lines: expandLabTestSelectionToOrderLines(orderedUniqueTestIds, rows) };
}
