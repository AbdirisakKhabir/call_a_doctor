import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthUser(req);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        doctorProfile: { select: { id: true } },
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.name);

    const branchRows = await prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    const branchIds =
      branchRows.length === 0 ? null : branchRows.map((r) => r.branchId);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleId: user.roleId,
        roleName: user.role.name,
        permissions,
        branchIds,
        doctorId: user.doctorProfile?.id ?? null,
      },
    });
  } catch (e) {
    console.error("Me error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
