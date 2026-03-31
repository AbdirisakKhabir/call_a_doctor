import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const includeBranches =
      searchParams.get("includeBranches") === "true" &&
      (await userHasPermission(auth.userId, "settings.manage"));
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const searchQ = searchParams.get("search")?.trim() || "";
    const where = searchQ
      ? {
          OR: [
            { name: { contains: searchQ } },
            { email: { contains: searchQ } },
            { role: { name: { contains: searchQ } } },
          ],
        }
      : {};

    const select = {
      id: true,
      email: true,
      name: true,
      roleId: true,
      isActive: true,
      createdAt: true,
      role: { select: { name: true } },
      ...(includeBranches
        ? {
            branches: {
              select: { branchId: true },
            },
          }
        : {}),
    } as const;

    function mapUserRow(u: unknown) {
      if (!includeBranches) return u;
      const row = u as { branches?: { branchId: number }[] } & Record<string, unknown>;
      const { branches, ...rest } = row;
      return {
        ...rest,
        branchIds: branches && branches.length > 0 ? branches.map((b) => b.branchId) : null,
      };
    }

    if (paginate) {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.user.count({ where }),
      ]);
      return NextResponse.json({
        data: users.map(mapUserRow),
        total,
        page,
        pageSize,
      });
    }

    const users = await prisma.user.findMany({
      where,
      select,
      orderBy: { createdAt: "desc" },
    });

    if (includeBranches) {
      return NextResponse.json(
        users.map((u) => {
          const { branches, ...rest } = u as typeof u & {
            branches?: { branchId: number }[];
          };
          return {
            ...rest,
            branchIds:
              branches && branches.length > 0
                ? branches.map((b) => b.branchId)
                : null,
          };
        })
      );
    }

    return NextResponse.json(users);
  } catch (e) {
    console.error("Users list error:", e);
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
    const { email, password, name, roleId } = body;
    const parsedRoleId = Number(roleId);

    if (!email || !password || !Number.isInteger(parsedRoleId)) {
      return NextResponse.json(
        { error: "Email, password and roleId are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: String(email).toLowerCase().trim(),
        password: hashed,
        name: name || null,
        roleId: parsedRoleId,
      },
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
    console.error("Create user error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
