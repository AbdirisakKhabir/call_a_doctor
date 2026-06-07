import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purgeExpiredTrashItems } from "@/lib/trash";

/**
 * Scheduled cleanup for trash tombstones past retention.
 * Secure with `Authorization: Bearer <CRON_TRASH_SECRET>` or query `?secret=<CRON_TRASH_SECRET>`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_TRASH_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json({ error: "CRON_TRASH_SECRET is not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const q = new URL(req.url).searchParams.get("secret");
  if (token !== secret && q !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const removed = await purgeExpiredTrashItems(prisma);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    console.error("Trash purge cron error:", e);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
