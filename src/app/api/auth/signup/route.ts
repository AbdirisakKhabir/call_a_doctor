import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, password } = body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
    };

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json(
        { error: "First name, last name, email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 400 }
      );
    }

    let staffRole = await prisma.role.findUnique({
      where: { name: "Staff" },
    });

    if (!staffRole) {
      staffRole = await prisma.role.create({
        data: {
          name: "Staff",
          description: "Default role for newly registered staff",
        },
      });
    }

    const dashboardPermission = await prisma.permission.findUnique({
      where: { name: "dashboard.view" },
    });

    if (dashboardPermission) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: staffRole.id,
            permissionId: dashboardPermission.id,
          },
        },
        update: {},
        create: {
          roleId: staffRole.id,
          permissionId: dashboardPermission.id,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const fullName = `${firstName} ${lastName}`.trim();

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: fullName,
        roleId: staffRole.id,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      roleId: user.roleId,
    });

    const permissions = user.role.permissions.map((rp) => rp.permission.name);

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roleId: user.roleId,
          roleName: user.role.name,
          permissions,
          branchIds: null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
