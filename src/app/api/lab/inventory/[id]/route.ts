import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import {
  computeBaseQuantityFromLabPackagingLines,
  replaceLabInventoryUnits,
  validateLabInventoryUnitsPayload,
  type LabInventoryUnitInput,
} from "@/lib/lab-inventory-units";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const row = await prisma.labInventoryItem.findUnique({
      where: { id: itemId },
      include: { labUnits: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    console.error("Lab inventory GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const unit = typeof body.unit === "string" ? body.unit.trim() : undefined;
    const sellingPrice = body.sellingPrice != null ? Math.max(0, Number(body.sellingPrice)) : undefined;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
    const labUnitsRaw = body.labUnits as LabInventoryUnitInput[] | undefined;
    const quantityLinesRaw = body.quantityLines;
    const quantityRaw = body.quantity;

    const existing = await prisma.labInventoryItem.findUnique({ where: { id: itemId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (labUnitsRaw !== undefined) {
      const v = validateLabInventoryUnitsPayload(labUnitsRaw);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
    }

    let resolvedQuantity: number | undefined;
    if (Array.isArray(quantityLinesRaw) && quantityLinesRaw.length > 0) {
      const lines = quantityLinesRaw
        .map((row: { unitKey?: string; quantity?: number }) => ({
          unitKey: String(row.unitKey ?? ""),
          quantity: Number(row.quantity),
        }))
        .filter((l) => l.unitKey && Number.isFinite(l.quantity) && l.quantity > 0);
      if (lines.length === 0) {
        return NextResponse.json({ error: "quantityLines must include at least one positive quantity." }, { status: 400 });
      }
      let unitRows: { unitKey: string; baseUnitsEach: number }[];
      if (labUnitsRaw !== undefined) {
        const v = validateLabInventoryUnitsPayload(labUnitsRaw);
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
        unitRows = v.rows.map((r) => ({ unitKey: r.unitKey, baseUnitsEach: r.baseUnitsEach }));
      } else {
        const row = await prisma.labInventoryItem.findUnique({
          where: { id: itemId },
          include: { labUnits: { orderBy: { sortOrder: "asc" } } },
        });
        unitRows = row?.labUnits.map((u) => ({ unitKey: u.unitKey, baseUnitsEach: u.baseUnitsEach })) ?? [];
      }
      if (unitRows.length === 0) {
        return NextResponse.json({ error: "Configure packaging units before using quantity lines." }, { status: 400 });
      }
      const conv = computeBaseQuantityFromLabPackagingLines(lines, unitRows);
      if (!conv.ok) {
        return NextResponse.json({ error: conv.error }, { status: 400 });
      }
      resolvedQuantity = conv.base;
    } else if (quantityRaw !== undefined) {
      const q = Math.floor(Number(quantityRaw));
      if (!Number.isFinite(q) || q < 0) {
        return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
      }
      resolvedQuantity = q;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (name !== undefined && name) data.name = name;
      if (unit !== undefined) data.unit = unit || "pcs";
      if (sellingPrice !== undefined && Number.isFinite(sellingPrice)) data.sellingPrice = sellingPrice;
      if (isActive !== undefined) data.isActive = isActive;
      if (resolvedQuantity !== undefined) data.quantity = resolvedQuantity;

      if (labUnitsRaw !== undefined) {
        const v = validateLabInventoryUnitsPayload(labUnitsRaw);
        if (!v.ok) throw new Error(v.error);
        const baseLabel = v.rows.find((r) => r.unitKey === "base")?.label;
        if (baseLabel) data.unit = baseLabel.slice(0, 191);
        await replaceLabInventoryUnits(tx, itemId, v.rows);
      }

      if (Object.keys(data).length > 0) {
        await tx.labInventoryItem.update({
          where: { id: itemId },
          data,
        });
      } else if (labUnitsRaw !== undefined) {
        await tx.labInventoryItem.findUniqueOrThrow({ where: { id: itemId } });
      }

      return tx.labInventoryItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { labUnits: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("Lab inventory PATCH error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
