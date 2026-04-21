import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";

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
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, sortOrder, isActive } = body;

    const data: { name?: string; sortOrder?: number; isActive?: boolean } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof sortOrder !== "undefined" && sortOrder !== null && sortOrder !== "") {
      const n = Number(sortOrder);
      if (!Number.isInteger(n)) {
        return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
      }
      data.sortOrder = n;
    }
    if (typeof isActive === "boolean") data.isActive = isActive;

    const row = await prisma.referralSource.update({
      where: { id: parsedId },
      data,
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "referral_source.update",
      module: "settings",
      resourceType: "ReferralSource",
      resourceId: row.id,
      metadata: { name: row.name },
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "That name already exists" }, { status: 400 });
    }
    console.error("Update referral source error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
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
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.referralSource.delete({ where: { id: parsedId } });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "referral_source.delete",
      module: "settings",
      resourceType: "ReferralSource",
      resourceId: parsedId,
      metadata: {},
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete referral source error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
