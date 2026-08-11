import type { Prisma } from "@prisma/client";
import { ADMIN_ROLE_NAME } from "@/lib/admin-role";

export type AuditLogQueryParams = {
  userId?: string | null;
  module?: string | null;
  action?: string | null;
  from?: string | null;
  to?: string | null;
  adminActorsOnly?: boolean;
};

export function buildAuditLogWhere(params: AuditLogQueryParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (params.userId && Number.isInteger(Number(params.userId))) {
    where.userId = Number(params.userId);
  }
  if (params.module?.trim()) {
    where.module = params.module.trim();
  }
  if (params.action?.trim()) {
    where.action = { contains: params.action.trim() };
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) {
      const end = new Date(params.to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  if (params.adminActorsOnly) {
    where.user = {
      is: {
        role: { name: ADMIN_ROLE_NAME },
      },
    };
  }

  return where;
}

export const AUDIT_LOG_EXPORT_MAX = 5000;
