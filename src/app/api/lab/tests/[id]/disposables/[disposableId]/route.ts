import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { normalizeLabUnitKey } from "@/lib/lab-inventory-units";

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

    const row = await prisma.labTestDisposable.updateMany({
      where: { id: did, labTestId },
      data,
    });
    if (row.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.labTestDisposable.findFirst({ where: { id: did } });
    return NextResponse.json(updated);
  } catch (e) {
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
