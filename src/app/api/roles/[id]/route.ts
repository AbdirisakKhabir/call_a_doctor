import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }
    const role = await prisma.role.findUnique({
      where: { id: parsedId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...role,
      permissions: role.permissions.map((rp) => rp.permission),
      userCount: role._count.users,
    });
  } catch (e) {
    console.error("Get role error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

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
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }
    const body = await req.json();
    const { name, description, permissionIds } = body;

    const data: { name?: string; description?: string | null } = {};
    if (typeof name === "string") data.name = name.trim();
    if (typeof description !== "undefined") data.description = description || null;

    if (Array.isArray(permissionIds)) {
      const parsedPermissionIds = permissionIds.map((pid: unknown) => Number(pid));
      if (parsedPermissionIds.some((pid) => !Number.isInteger(pid))) {
        return NextResponse.json(
          { error: "Invalid permissionIds" },
          { status: 400 }
        );
      }
      await prisma.rolePermission.deleteMany({ where: { roleId: parsedId } });
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: parsedPermissionIds.map((pid) => ({
            roleId: parsedId,
            permissionId: pid,
          })),
        });
      }
    }

    const role = await prisma.role.update({
      where: { id: parsedId },
      data,
      include: {
        permissions: { include: { permission: true } },
      },
    });
    return NextResponse.json({
      ...role,
      permissions: role.permissions.map((rp) => rp.permission),
    });
  } catch (e) {
    console.error("Update role error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "Invalid role id" }, { status: 400 });
    }
    const role = await prisma.role.findUnique({
      where: { id: parsedId },
      include: { permissions: true },
    });
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
    const snapshot = {
      name: role.name,
      description: role.description,
      permissionIds: role.permissions.map((rp) => rp.permissionId),
    };
    await prisma.$transaction(async (tx) => {
      await recordTrashEntry(tx, {
        entityType: "Role",
        recordId: parsedId,
        title: role.name,
        snapshot: toTrashSnapshot(snapshot),
        deletedById: auth.userId,
      });
      await tx.rolePermission.deleteMany({ where: { roleId: parsedId } });
      await tx.role.delete({ where: { id: parsedId } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete role error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
