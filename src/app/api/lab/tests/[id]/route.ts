import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const { categoryId, name, code, unit, normalRange, isActive } = body;
    const data: Record<string, unknown> = {};
    if (categoryId != null) data.categoryId = Number(categoryId);
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof code !== "undefined") data.code = code ? String(code).trim() : null;
    if (typeof unit !== "undefined") data.unit = unit ? String(unit).trim() : null;
    if (typeof normalRange !== "undefined") data.normalRange = normalRange ? String(normalRange).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;
    const test = await prisma.labTest.update({ where: { id: parsedId }, data });
    return NextResponse.json(test);
  } catch (e) {
    console.error("Update lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await prisma.labTest.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
