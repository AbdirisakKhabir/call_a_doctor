import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { isTrashEntityRestorable, restoreFromTrashSnapshot } from "@/lib/trash-restore";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const row = await prisma.trashItem.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isTrashEntityRestorable(row.entityType)) {
      return NextResponse.json(
        { error: "Restore is not available for this record type (snapshot is for audit only)." },
        { status: 400 }
      );
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const res = await restoreFromTrashSnapshot(tx, row.entityType, row.snapshot);
        await tx.trashItem.delete({ where: { id: row.id } });
        return res;
      });
      return NextResponse.json({ ok: true, restoredId: created.id, entityType: row.entityType });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("unsupported_entity")) {
        return NextResponse.json({ error: "Restore not implemented" }, { status: 400 });
      }
      console.error("Trash restore error:", err);
      return NextResponse.json(
        {
          error:
            "Could not restore (a unique field may conflict, or related data changed). Check the server log.",
        },
        { status: 409 }
      );
    }
  } catch (e) {
    console.error("Trash restore route error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.trashItem.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Trash delete tombstone error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
