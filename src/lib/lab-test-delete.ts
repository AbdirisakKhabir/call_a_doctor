import type { Prisma } from "@prisma/client";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";

export class LabTestDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabTestDeleteError";
  }
}

export async function countLabTestOrderUsage(
  tx: Prisma.TransactionClient,
  testId: number
): Promise<number> {
  return tx.labOrderItem.count({
    where: {
      OR: [{ labTestId: testId }, { panelParentTestId: testId }],
    },
  });
}

async function deleteLabTestRecord(
  tx: Prisma.TransactionClient,
  testId: number,
  deletedById: number
): Promise<void> {
  const row = await tx.labTest.findUnique({
    where: { id: testId },
    include: { disposables: true },
  });
  if (!row) return;

  await recordTrashEntry(tx, {
    entityType: "LabTest",
    recordId: testId,
    title: row.name,
    detail: row.code,
    snapshot: toTrashSnapshot(row),
    deletedById,
  });
  await tx.labTest.delete({ where: { id: testId } });
}

/** Deletes a test and its sub-tests when none appear on lab orders. */
export async function deleteLabTestIfUnused(
  tx: Prisma.TransactionClient,
  testId: number,
  deletedById: number
): Promise<void> {
  const row = await tx.labTest.findUnique({ where: { id: testId } });
  if (!row) {
    throw new LabTestDeleteError("Not found");
  }

  const usage = await countLabTestOrderUsage(tx, testId);
  if (usage > 0) {
    throw new LabTestDeleteError(
      `This test is used on ${usage} lab order line(s) and cannot be deleted.`
    );
  }

  const subtests = await tx.labTest.findMany({
    where: { parentTestId: testId },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const sub of subtests) {
    const subUsage = await countLabTestOrderUsage(tx, sub.id);
    if (subUsage > 0) {
      throw new LabTestDeleteError(
        `A sub-test of this panel is used on ${subUsage} lab order line(s) and cannot be deleted.`
      );
    }
    await deleteLabTestRecord(tx, sub.id, deletedById);
  }

  await deleteLabTestRecord(tx, testId, deletedById);
}

/** Deletes a category when its tests are not referenced on lab orders. */
export async function deleteLabCategoryIfUnused(
  tx: Prisma.TransactionClient,
  categoryId: number,
  deletedById: number
): Promise<void> {
  const category = await tx.labCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new LabTestDeleteError("Not found");
  }

  const tests = await tx.labTest.findMany({
    where: { categoryId },
    select: { id: true, name: true, parentTestId: true },
    orderBy: { id: "asc" },
  });

  for (const test of tests) {
    const usage = await countLabTestOrderUsage(tx, test.id);
    if (usage > 0) {
      throw new LabTestDeleteError(
        `Cannot delete category: test "${test.name}" is used on ${usage} lab order line(s).`
      );
    }
  }

  const subtests = tests.filter((t) => t.parentTestId != null);
  for (const test of subtests) {
    await deleteLabTestRecord(tx, test.id, deletedById);
  }

  const roots = tests.filter((t) => t.parentTestId == null);
  for (const root of roots) {
    const children = await tx.labTest.findMany({
      where: { parentTestId: root.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const child of children) {
      const usage = await countLabTestOrderUsage(tx, child.id);
      if (usage > 0) {
        throw new LabTestDeleteError(
          "Cannot delete category: a sub-test linked to a panel in this category is used on lab orders."
        );
      }
      await deleteLabTestRecord(tx, child.id, deletedById);
    }
    await deleteLabTestRecord(tx, root.id, deletedById);
  }

  await recordTrashEntry(tx, {
    entityType: "LabCategory",
    recordId: categoryId,
    title: category.name,
    snapshot: toTrashSnapshot(category),
    deletedById,
  });
  await tx.labCategory.delete({ where: { id: categoryId } });
}
