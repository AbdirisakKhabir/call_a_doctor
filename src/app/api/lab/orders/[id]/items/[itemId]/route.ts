import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, itemId } = await params;
    const parsedId = Number(id);
    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedId) || !Number.isInteger(parsedItemId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await req.json();
    const { resultValue, resultUnit, status, notes } = body;
    const item = await prisma.labOrderItem.findFirst({
      where: { id: parsedItemId, labOrderId: parsedId },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (typeof resultValue !== "undefined") data.resultValue = resultValue ? String(resultValue) : null;
    if (typeof resultUnit !== "undefined") data.resultUnit = resultUnit ? String(resultUnit) : null;
    if (typeof status === "string" && (status === "pending" || status === "completed")) data.status = status;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes) : null;
    if (status === "completed" && (resultValue || resultUnit)) {
      data.recordedById = auth.userId;
      data.recordedAt = new Date();
    }
    const updated = await prisma.labOrderItem.update({
      where: { id: parsedItemId },
      data,
      include: { labTest: { select: { id: true, name: true, unit: true, normalRange: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("Update lab result error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
