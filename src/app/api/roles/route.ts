import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

function mapRoleRow(r: {
  id: number;
  name: string;
  description: string | null;
  _count: { users: number };
  permissions: { permission: Record<string, unknown> }[];
}) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    userCount: r._count.users,
    permissions: r.permissions.map((rp) => rp.permission),
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(req.nextUrl.searchParams);

    const include = {
      _count: { select: { users: true } },
      permissions: { include: { permission: true } },
    };

    if (paginate) {
      const [roles, total] = await Promise.all([
        prisma.role.findMany({
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.role.count(),
      ]);
      return NextResponse.json({
        data: roles.map(mapRoleRow),
        total,
        page,
        pageSize,
      });
    }

    const roles = await prisma.role.findMany({
      include,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(roles.map(mapRoleRow));
  } catch (e) {
    console.error("Roles list error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, permissionIds } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Role name is required" },
        { status: 400 }
      );
    }

    const role = await prisma.role.create({
      data: {
        name: String(name).trim(),
        description: description || null,
      },
    });

    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      const parsedPermissionIds = permissionIds.map((pid: unknown) => Number(pid));
      if (parsedPermissionIds.some((pid) => !Number.isInteger(pid))) {
        return NextResponse.json(
          { error: "Invalid permissionIds" },
          { status: 400 }
        );
      }
      await prisma.rolePermission.createMany({
        data: parsedPermissionIds.map((pid) => ({
          roleId: role.id,
          permissionId: pid,
        })),
      });
    }

    const roleWithPerms = await prisma.role.findUnique({
      where: { id: role.id },
      include: {
        permissions: { include: { permission: true } },
      },
    });

    return NextResponse.json({
      ...roleWithPerms,
      permissions: roleWithPerms?.permissions.map((rp) => rp.permission) ?? [],
    });
  } catch (e) {
    console.error("Create role error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
