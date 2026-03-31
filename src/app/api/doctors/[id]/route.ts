import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.email !== "undefined") data.email = body.email ? String(body.email).trim() : null;
    if (typeof body.phone !== "undefined") data.phone = body.phone ? String(body.phone).trim() : null;
    if (typeof body.specialty !== "undefined") data.specialty = body.specialty ? String(body.specialty).trim() : null;
    if (typeof body.branchId !== "undefined") data.branchId = body.branchId ? Number(body.branchId) : null;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (typeof body.userId !== "undefined") {
      if (body.userId === null || body.userId === "") {
        data.userId = null;
      } else {
        const uid = Number(body.userId);
        if (!Number.isInteger(uid)) {
          return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
        }
        const taken = await prisma.doctor.findFirst({
          where: { userId: uid, NOT: { id: parsedId } },
        });
        if (taken) {
          return NextResponse.json({ error: "That user is already linked to another doctor" }, { status: 409 });
        }
        const u = await prisma.user.findUnique({ where: { id: uid } });
        if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
        data.userId = uid;
      }
    }
    const doctor = await prisma.doctor.update({
      where: { id: parsedId },
      data,
      include: { branch: { select: { id: true, name: true } } },
    });
    return NextResponse.json(doctor);
  } catch (e) {
    console.error("Update doctor error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    await prisma.doctor.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete doctor error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
