import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";

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

    const row = await prisma.category.findUnique({
      where: { id: parsedId },
      select: { branchId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, row.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, isActive } = body;

    const data: { name?: string; description?: string | null; isActive?: boolean } = {};
    if (typeof name === "string" && name.trim()) {
      const trimmed = name.trim();
      const dup = await prisma.category.findFirst({
        where: {
          branchId: row.branchId,
          name: trimmed,
          NOT: { id: parsedId },
        },
      });
      if (dup) {
        return NextResponse.json({ error: "Another category at this branch already has this name" }, { status: 400 });
      }
      data.name = trimmed;
    }
    if (typeof description !== "undefined") data.description = description ? String(description).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;

    const category = await prisma.category.update({
      where: { id: parsedId },
      data,
    });
    return NextResponse.json(category);
  } catch (e) {
    console.error("Update category error:", e);
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

    const row = await prisma.category.findUnique({
      where: { id: parsedId },
      select: { branchId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, row.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.category.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
