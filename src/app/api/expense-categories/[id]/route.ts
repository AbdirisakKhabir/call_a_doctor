import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, isActive } = body;

    const data: { name?: string; isActive?: boolean } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof isActive === "boolean") data.isActive = isActive;

    const category = await prisma.expenseCategory.update({
      where: { id: parsedId },
      data,
    });
    return NextResponse.json(category);
  } catch (e) {
    console.error("Update expense category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 });
    }

    await prisma.expenseCategory.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete expense category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
