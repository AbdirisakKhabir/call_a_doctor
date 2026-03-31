import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json();
    const { branchIds } = body as { branchIds?: unknown };
    if (!Array.isArray(branchIds)) {
      return NextResponse.json({ error: "branchIds must be an array of branch ids" }, { status: 400 });
    }

    const ids = branchIds
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0);

    const unique = [...new Set(ids)];

    if (unique.length > 0) {
      const found = await prisma.branch.findMany({
        where: { id: { in: unique }, isActive: true },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        return NextResponse.json(
          { error: "One or more branch ids are invalid or inactive" },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction([
      prisma.userBranch.deleteMany({ where: { userId } }),
      ...(unique.length > 0
        ? [
            prisma.userBranch.createMany({
              data: unique.map((branchId) => ({ userId, branchId })),
            }),
          ]
        : []),
    ]);

    const rows = await prisma.userBranch.findMany({
      where: { userId },
      select: { branchId: true },
    });
    const outIds = rows.length === 0 ? null : rows.map((r) => r.branchId);

    return NextResponse.json({ userId, branchIds: outIds });
  } catch (e) {
    console.error("Update user branches error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
