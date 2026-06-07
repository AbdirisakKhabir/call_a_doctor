import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.slice(0, 128);
  return null;
}

export function getUserAgent(req: NextRequest): string | null {
  const ua = req.headers.get("user-agent");
  if (!ua) return null;
  return ua.length > 2000 ? ua.slice(0, 2000) : ua;
}

type LogParams = {
  userId: number;
  action: string;
  module?: string | null;
  resourceType?: string | null;
  resourceId?: number | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Persists an audit row. Never throws; logs on failure. */
export async function logAudit(params: LogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action.slice(0, 191),
        module: params.module ? params.module.slice(0, 191) : null,
        resourceType: params.resourceType ? params.resourceType.slice(0, 191) : null,
        resourceId: params.resourceId ?? null,
        metadata:
          params.metadata != null
            ? (JSON.parse(JSON.stringify(params.metadata)) as Prisma.InputJsonValue)
            : undefined,
        ipAddress: params.ipAddress ? params.ipAddress.slice(0, 191) : null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (e) {
    console.error("Audit log write failed:", e);
  }
}

export async function logAuditFromRequest(
  req: NextRequest,
  params: Omit<LogParams, "ipAddress" | "userAgent"> & { userId: number }
): Promise<void> {
  await logAudit({
    ...params,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
}
