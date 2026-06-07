import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; disposableId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id, disposableId } = await params;
    const serviceId = Number(id);
    const dispId = Number(disposableId);
    if (!Number.isInteger(serviceId) || !Number.isInteger(dispId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const row = await prisma.serviceDisposable.findFirst({
      where: { id: dispId, serviceId },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.serviceDisposable.delete({ where: { id: dispId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Service disposable DELETE error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
