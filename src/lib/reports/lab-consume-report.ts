import type { Prisma, PrismaClient } from "@prisma/client";

export type LabConsumeReport = {
  range: { from: string; to: string };
  branchId: number | null;
  totalTestsCompleted: number;
  tests: {
    labTestId: number;
    testName: string;
    testCode: string | null;
    completedCount: number;
  }[];
  disposables: {
    code: string;
    name: string;
    unit: string;
    totalOut: number;
  }[];
};

type BranchScope = { branchId: number } | { branchId: { in: number[] } } | Record<string, never>;

function coalesceCompletionTime(recordedAt: Date | null, disposablesDeductedAt: Date | null, createdAt: Date): Date {
  return recordedAt ?? disposablesDeductedAt ?? createdAt;
}

/**
 * Lab tests completed in range (per appointment branch) + lab inventory disposables consumed in range.
 */
export async function buildLabConsumeReport(
  prisma: PrismaClient,
  args: {
    from: string;
    to: string;
    dateFilter: { gte: Date; lte: Date };
    branchId: number | null;
    appointmentBranchScope: BranchScope;
    labMovementBranchFilter: Prisma.LabStockMovementWhereInput["branchId"];
  }
): Promise<LabConsumeReport> {
  const { dateFilter, appointmentBranchScope, labMovementBranchFilter, branchId, from, to } = args;
  const fromD = dateFilter.gte;
  const toD = dateFilter.lte;

  const labOrderWhere: Prisma.LabOrderWhereInput =
    Object.keys(appointmentBranchScope).length === 0
      ? {}
      : { appointment: appointmentBranchScope as Prisma.AppointmentWhereInput };

  const rawItems = await prisma.labOrderItem.findMany({
    where: {
      status: "completed",
      labOrder: labOrderWhere,
      OR: [
        { recordedAt: { gte: fromD, lte: toD } },
        { disposablesDeductedAt: { gte: fromD, lte: toD } },
        { createdAt: { gte: fromD, lte: toD } },
      ],
    },
    select: {
      labTestId: true,
      recordedAt: true,
      disposablesDeductedAt: true,
      createdAt: true,
      labTest: { select: { id: true, name: true, code: true } },
    },
  });

  const inRange = rawItems.filter((it) => {
    const t = coalesceCompletionTime(it.recordedAt, it.disposablesDeductedAt, it.createdAt);
    return t >= fromD && t <= toD;
  });

  const testMap = new Map<
    number,
    { labTestId: number; testName: string; testCode: string | null; completedCount: number }
  >();
  for (const it of inRange) {
    const cur = testMap.get(it.labTestId);
    if (cur) cur.completedCount += 1;
    else {
      testMap.set(it.labTestId, {
        labTestId: it.labTestId,
        testName: it.labTest.name,
        testCode: it.labTest.code,
        completedCount: 1,
      });
    }
  }

  const tests = [...testMap.values()].sort((a, b) => a.testName.localeCompare(b.testName));

  const disposableMovements = await prisma.labStockMovement.findMany({
    where: {
      reason: "disposable",
      createdAt: { gte: fromD, lte: toD },
      ...(labMovementBranchFilter !== undefined ? { branchId: labMovementBranchFilter } : {}),
    },
    include: {
      labInventoryItem: { select: { id: true, code: true, name: true, unit: true } },
    },
  });

  const disposableByCode = new Map<string, { code: string; name: string; unit: string; totalOut: number }>();
  for (const m of disposableMovements) {
    const q = Math.abs(m.signedQuantity);
    const key = m.labInventoryItem.code;
    const cur = disposableByCode.get(key);
    if (cur) cur.totalOut += q;
    else {
      disposableByCode.set(key, {
        code: m.labInventoryItem.code,
        name: m.labInventoryItem.name,
        unit: m.labInventoryItem.unit || "pcs",
        totalOut: q,
      });
    }
  }

  const disposables = [...disposableByCode.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    range: { from, to },
    branchId,
    totalTestsCompleted: inRange.length,
    tests,
    disposables,
  };
}
