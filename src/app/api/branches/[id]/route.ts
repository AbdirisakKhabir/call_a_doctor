import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.address !== "undefined") data.address = body.address ? String(body.address).trim() : null;
    if (typeof body.phone !== "undefined") data.phone = body.phone ? String(body.phone).trim() : null;
    if (typeof body.email !== "undefined") data.email = body.email ? String(body.email).trim() : null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const branch = await prisma.branch.update({ where: { id: parsedId }, data });
    return NextResponse.json(branch);
  } catch (e) {
    console.error("Update branch error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const [appts, doctors, services] = await Promise.all([
      prisma.appointment.count({ where: { branchId: parsedId } }),
      prisma.doctor.count({ where: { branchId: parsedId } }),
      prisma.service.count({ where: { branchId: parsedId } }),
    ]);
    if (appts > 0 || doctors > 0 || services > 0) {
      return NextResponse.json(
        {
          error:
            "This branch is linked to appointments, doctors, or services. Deactivate it instead of deleting, or reassign those records first.",
        },
        { status: 400 }
      );
    }

    await prisma.branch.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete branch error:", e);
    return NextResponse.json(
      { error: "Could not delete branch. It may still be referenced by pharmacy or other records." },
      { status: 500 }
    );
  }
}
