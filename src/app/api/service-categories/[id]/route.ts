import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { capitalizeNamePart } from "@/lib/capitalize-name";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";
import { isPrismaUniqueError } from "@/lib/service-category";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const category = await prisma.serviceCategory.findUnique({
      where: { id: parsedId },
      include: {
        _count: { select: { services: true } },
        services: {
          orderBy: { name: "asc" },
          include: { branch: { select: { id: true, name: true } } },
        },
      },
    });
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(category);
  } catch (e) {
    console.error("Get service category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const { name, description, isActive } = body;
    const data: { name?: string; description?: string | null; isActive?: boolean } = {};
    if (typeof name === "string" && name.trim()) data.name = capitalizeNamePart(name);
    if (typeof description !== "undefined") data.description = description ? String(description).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;
    const cat = await prisma.serviceCategory.update({ where: { id: parsedId }, data });
    return NextResponse.json(cat);
  } catch (e) {
    if (isPrismaUniqueError(e)) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 400 });
    }
    console.error("Update service category error:", e);
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
    const row = await prisma.serviceCategory.findUnique({
      where: { id: parsedId },
      include: { _count: { select: { services: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row._count.services > 0) {
      return NextResponse.json(
        { error: "Reassign or remove services in this category before deleting it." },
        { status: 400 }
      );
    }
    await prisma.$transaction(async (tx) => {
      await recordTrashEntry(tx, {
        entityType: "ServiceCategory",
        recordId: parsedId,
        title: row.name,
        snapshot: toTrashSnapshot(row),
        deletedById: auth.userId,
      });
      await tx.serviceCategory.delete({ where: { id: parsedId } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete service category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
