import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { ADMIN_ROLE_NAME } from "@/lib/admin-role";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasFullAudit = await userHasPermission(auth.userId, "audit.view");
    const hasAdminAuditOnly = await userHasPermission(auth.userId, "audit.view_admins");
    if (!hasFullAudit && !hasAdminAuditOnly) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userIdParam = searchParams.get("userId");
    const moduleParam = searchParams.get("module");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const actionSearch = searchParams.get("action");
    const adminActorsOnlyParam = searchParams.get("adminActorsOnly") === "true";
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const restrictToAdminActors =
      (!hasFullAudit && hasAdminAuditOnly) || (hasFullAudit && adminActorsOnlyParam);

    const where: Prisma.AuditLogWhereInput = {};

    if (userIdParam && Number.isInteger(Number(userIdParam))) {
      where.userId = Number(userIdParam);
    }
    if (moduleParam && moduleParam.trim()) {
      where.module = moduleParam.trim();
    }
    if (actionSearch && actionSearch.trim()) {
      where.action = { contains: actionSearch.trim() };
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (restrictToAdminActors) {
      where.user = {
        is: {
          role: { name: ADMIN_ROLE_NAME },
        },
      };
    }

    const include = {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: { select: { name: true } },
        },
      },
    };

    if (paginate) {
      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);
      return NextResponse.json({ data, total, page, pageSize });
    }

    const data = await prisma.auditLog.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("Audit logs list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
