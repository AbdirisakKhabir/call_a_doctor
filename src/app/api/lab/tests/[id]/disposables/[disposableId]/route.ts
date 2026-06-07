import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { ensureLabPackagingUnitsFromPharmacyProduct, normalizeLabUnitKey } from "@/lib/lab-inventory-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; disposableId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, disposableId } = await params;
    const labTestId = Number(id);
    const did = Number(disposableId);
    if (!Number.isInteger(labTestId) || !Number.isInteger(did)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const unitsPerTest = body.unitsPerTest != null ? Number(body.unitsPerTest) : NaN;
    const deductionUnitKeyIn =
      typeof body.deductionUnitKey === "string" ? normalizeLabUnitKey(body.deductionUnitKey) : undefined;
    const branchId = body.branchId != null ? Number(body.branchId) : NaN;

    const data: { unitsPerTest?: number; deductionUnitKey?: string } = {};
    if (body.unitsPerTest !== undefined) {
      if (!Number.isFinite(unitsPerTest) || unitsPerTest <= 0) {
        return NextResponse.json({ error: "Units per test must be a positive number" }, { status: 400 });
      }
      data.unitsPerTest = unitsPerTest;
    }
    if (deductionUnitKeyIn !== undefined) {
      data.deductionUnitKey = deductionUnitKeyIn;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (deductionUnitKeyIn !== undefined) {
      if (!Number.isInteger(branchId) || branchId <= 0) {
        return NextResponse.json({ error: "branchId is required when changing deduction unit" }, { status: 400 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.labTestDisposable.findFirst({
        where: { id: did, labTestId },
        select: { productCode: true },
      });
      if (!existing) return null;

      if (deductionUnitKeyIn !== undefined && Number.isInteger(branchId) && branchId > 0) {
        const ensured = await ensureLabPackagingUnitsFromPharmacyProduct(tx, {
          branchId,
          productCode: normalizeProductCode(existing.productCode),
        });
        if (!ensured.ok) {
          throw new Error(`ENSURE_FAILED:${ensured.error}`);
        }
      }

      const row = await tx.labTestDisposable.updateMany({
        where: { id: did, labTestId },
        data,
      });
      if (row.count === 0) return null;
      return tx.labTestDisposable.findFirst({ where: { id: did } });
    });

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ENSURE_FAILED:")) {
      return NextResponse.json({ error: e.message.replace(/^ENSURE_FAILED:/, "") }, { status: 400 });
    }
    console.error("Lab test disposable PATCH error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; disposableId: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, disposableId } = await params;
    const labTestId = Number(id);
    const did = Number(disposableId);
    if (!Number.isInteger(labTestId) || !Number.isInteger(did)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const row = await prisma.labTestDisposable.deleteMany({
      where: { id: did, labTestId },
    });
    if (row.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Lab test disposable DELETE error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
