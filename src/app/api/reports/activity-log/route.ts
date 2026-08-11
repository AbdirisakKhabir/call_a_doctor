import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { buildAuditLogWhere, AUDIT_LOG_EXPORT_MAX } from "@/lib/audit-log-query";

const include = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hasFullAudit = await userHasPermission(auth.userId, "audit.view");
    const hasAdminAuditOnly = await userHasPermission(auth.userId, "audit.view_admins");
    if (!hasFullAudit && !hasAdminAuditOnly) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const adminActorsOnlyParam = searchParams.get("adminActorsOnly") === "true";
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

    const forExport = searchParams.get("export") === "1";
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const take = forExport ? AUDIT_LOG_EXPORT_MAX : pageSize;
    const usePagination = paginate && !forExport;

    const [rows, total, userGroups] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        ...(usePagination ? { skip, take: pageSize } : { take }),
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ["userId"],
        where,
        _count: { userId: true },
      }),
    ]);

    if (usePagination) {
      return NextResponse.json({
        data: rows,
        total,
        page,
        pageSize,
        summary: {
          uniqueUsers: userGroups.length,
          restrictedToAdminActors: restrictToAdminActors,
        },
      });
    }

    return NextResponse.json({
      data: rows,
      total,
      summary: {
        uniqueUsers: userGroups.length,
        restrictedToAdminActors: restrictToAdminActors,
      },
    });
  } catch (e) {
    console.error("Activity log report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
