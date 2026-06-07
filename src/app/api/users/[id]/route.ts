import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";

export async function GET(
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
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: parsedId },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { name: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (e) {
    console.error("Get user error:", e);
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
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const body = await req.json();
    const { email, name, roleId, isActive, password } = body;

    const data: {
      email?: string;
      name?: string | null;
      roleId?: number;
      isActive?: boolean;
      password?: string;
    } = {};

    if (typeof email === "string") data.email = email.toLowerCase().trim();
    if (typeof name !== "undefined") data.name = name || null;
    if (typeof roleId !== "undefined") {
      const parsedRoleId = Number(roleId);
      if (!Number.isInteger(parsedRoleId)) {
        return NextResponse.json({ error: "Invalid roleId" }, { status: 400 });
      }
      data.roleId = parsedRoleId;
    }
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof password === "string" && password.length > 0) {
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: parsedId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        isActive: true,
        createdAt: true,
        role: { select: { name: true } },
      },
    });
    return NextResponse.json(user);
  } catch (e) {
    console.error("Update user error:", e);
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
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    if (parsedId === auth.userId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }
    const u = await prisma.user.findUnique({ where: { id: parsedId } });
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await recordTrashEntry(tx, {
        entityType: "User",
        recordId: parsedId,
        title: u.email,
        detail: u.name,
        snapshot: toTrashSnapshot(u),
        deletedById: auth.userId,
      });
      await tx.user.delete({ where: { id: parsedId } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete user error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
