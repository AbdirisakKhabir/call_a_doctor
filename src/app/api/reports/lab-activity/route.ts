import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEnd(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchId = Number(searchParams.get("branchId"));
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    if (!fromStr || !toStr) {
      return NextResponse.json({ error: "from and to dates are required (YYYY-MM-DD)" }, { status: 400 });
    }
    const fromD = dayStart(new Date(fromStr + "T12:00:00"));
    const toD = dayEnd(new Date(toStr + "T12:00:00"));
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime()) || fromD > toD) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true },
    });
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    const completedLines = await prisma.labOrderItem.findMany({
      where: {
        status: "completed",
        labOrder: { appointment: { branchId } },
      },
      select: { recordedAt: true, disposablesDeductedAt: true, createdAt: true },
    });
    const testsCompleted = completedLines.filter((it) => {
      const t = it.recordedAt ?? it.disposablesDeductedAt ?? it.createdAt;
      return t >= fromD && t <= toD;
    }).length;

    const disposableMovements = await prisma.labStockMovement.findMany({
      where: {
        branchId,
        reason: "disposable",
        createdAt: { gte: fromD, lte: toD },
      },
      include: {
        labInventoryItem: { select: { id: true, code: true, name: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const disposableByCode = new Map<
      string,
      { code: string; name: string; unit: string; totalOut: number }
    >();
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

    const allMovements = await prisma.labStockMovement.findMany({
      where: {
        branchId,
        createdAt: { gte: fromD, lte: toD },
      },
      include: {
        labInventoryItem: { select: { code: true, name: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const inventoryItems = await prisma.labInventoryItem.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        quantity: true,
        sellingPrice: true,
      },
    });

    return NextResponse.json({
      branch,
      from: fromStr,
      to: toStr,
      testsCompleted,
      disposableSummary: Array.from(disposableByCode.values()).sort((a, b) => a.name.localeCompare(b.name)),
      disposableMovements: disposableMovements.slice(0, 500),
      inventorySnapshot: inventoryItems,
      movementLog: allMovements.map((m) => ({
        id: m.id,
        at: m.createdAt.toISOString(),
        reason: m.reason,
        code: m.labInventoryItem.code,
        name: m.labInventoryItem.name,
        unit: m.labInventoryItem.unit,
        signedQuantity: m.signedQuantity,
        notes: m.notes,
      })),
    });
  } catch (e) {
    console.error("Lab activity report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
