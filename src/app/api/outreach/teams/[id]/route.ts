import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (
      !(await userHasPermission(auth.userId, "pharmacy.edit")) &&
      !(await userHasPermission(auth.userId, "settings.manage"))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const tid = Number(id);
    if (!Number.isInteger(tid)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.outreachTeam.findUnique({ where: { id: tid } });
    if (!existing) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, existing.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, phone, notes, isActive } = body;

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof phone !== "undefined") data.phone = phone ? String(phone).trim() : null;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;

    const team = await prisma.outreachTeam.update({
      where: { id: tid },
      data,
      include: { members: true },
    });

    return NextResponse.json(team);
  } catch (e) {
    console.error("Outreach team patch error:", e);
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

    if (
      !(await userHasPermission(auth.userId, "pharmacy.edit")) &&
      !(await userHasPermission(auth.userId, "settings.manage"))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const tid = Number(id);
    if (!Number.isInteger(tid)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.outreachTeam.findUnique({ where: { id: tid } });
    if (!existing) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, existing.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.outreachTeam.update({
      where: { id: tid },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Outreach team delete error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
