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
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.description !== "undefined") data.description = body.description ? String(body.description).trim() : null;
    if (typeof body.price === "number" || (typeof body.price === "string" && body.price !== "")) data.price = Math.max(0, Number(body.price) || 0);
    if (typeof body.durationMinutes !== "undefined") data.durationMinutes = body.durationMinutes ? Number(body.durationMinutes) : null;
    if (typeof body.branchId !== "undefined") data.branchId = body.branchId ? Number(body.branchId) : null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const service = await prisma.service.update({
      where: { id: parsedId },
      data,
      include: { branch: { select: { id: true, name: true } } },
    });
    return NextResponse.json(service);
  } catch (e) {
    console.error("Update service error:", e);
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
    await prisma.service.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete service error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
