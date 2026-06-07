import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import type { UserActivityStatus } from "@/types/user-activity";

const ACTIVE_MS = 5 * 60 * 1000;
const RECENT_MS = 24 * 60 * 60 * 1000;

function activityStatus(
  isActive: boolean,
  lastSeenAt: Date | null,
  lastLoginAt: Date | null
): UserActivityStatus {
  if (!isActive) return "inactive";
  const now = Date.now();
  if (lastSeenAt) {
    const seenAgo = now - lastSeenAt.getTime();
    if (seenAgo <= ACTIVE_MS) return "online";
    if (seenAgo <= RECENT_MS) return "recent";
  }
  if (lastLoginAt && now - lastLoginAt.getTime() <= RECENT_MS) return "signed_in_before";
  if (lastLoginAt) return "signed_in_before";
  return "never";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView =
      (await userHasPermission(auth.userId, "audit.view")) ||
      (await userHasPermission(auth.userId, "audit.view_admins"));
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastLoginAt: true,
        lastSeenAt: true,
        role: { select: { name: true } },
      },
    });

    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isActive: u.isActive,
      roleName: u.role.name,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      status: activityStatus(u.isActive, u.lastSeenAt, u.lastLoginAt),
    }));

    rows.sort((a, b) => {
      const rank: Record<UserActivityStatus, number> = {
        online: 0,
        recent: 1,
        signed_in_before: 2,
        never: 3,
        inactive: 4,
      };
      const dr = rank[a.status as UserActivityStatus] - rank[b.status as UserActivityStatus];
      if (dr !== 0) return dr;
      const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      const la = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const lb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return lb - la;
    });

    const summary = {
      total: rows.length,
      online: rows.filter((r) => r.status === "online").length,
      activeLast24h: rows.filter((r) => r.status === "online" || r.status === "recent").length,
      inactive: rows.filter((r) => r.status === "inactive").length,
    };

    return NextResponse.json({ users: rows, summary });
  } catch (e) {
    console.error("Users activity GET:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
