import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { purgeExpiredTrashItems } from "@/lib/trash";
import { isTrashEntityRestorable } from "@/lib/trash-restore";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await purgeExpiredTrashItems(prisma);

    const { searchParams } = new URL(req.url);
    const take = Math.min(100, Math.max(10, Number(searchParams.get("take") || "50") || 50));

    const items = await prisma.trashItem.findMany({
      orderBy: { deletedAt: "desc" },
      take,
      include: {
        deletedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const now = Date.now();
    return NextResponse.json({
      items: items.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        recordId: row.recordId,
        title: row.title,
        detail: row.detail,
        deletedAt: row.deletedAt.toISOString(),
        purgeAt: row.purgeAt.toISOString(),
        daysRemaining: Math.max(0, Math.ceil((row.purgeAt.getTime() - now) / (24 * 60 * 60 * 1000))),
        restorable: isTrashEntityRestorable(row.entityType),
        deletedBy: row.deletedBy,
      })),
      retentionDays: 30,
    });
  } catch (e) {
    console.error("Trash list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
