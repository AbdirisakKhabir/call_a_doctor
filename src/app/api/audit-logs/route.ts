import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { buildAuditLogWhere } from "@/lib/audit-log-query";

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
    const adminActorsOnlyParam = searchParams.get("adminActorsOnly") === "true";
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const restrictToAdminActors =
      (!hasFullAudit && hasAdminAuditOnly) || (hasFullAudit && adminActorsOnlyParam);

    const where = buildAuditLogWhere({
      userId: searchParams.get("userId"),
      module: searchParams.get("module"),
      action: searchParams.get("action"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      adminActorsOnly: restrictToAdminActors,
    });

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
