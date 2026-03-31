import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid supplier id" }, { status: 400 });
    }

    const row = await prisma.supplier.findUnique({
      where: { id: parsedId },
      select: { branchId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, row.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, contactPerson, email, phone, address, isActive } = body;

    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof contactPerson !== "undefined") data.contactPerson = contactPerson ? String(contactPerson).trim() : null;
    if (typeof email !== "undefined") data.email = email ? String(email).trim() : null;
    if (typeof phone !== "undefined") data.phone = phone ? String(phone).trim() : null;
    if (typeof address !== "undefined") data.address = address ? String(address).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;

    const supplier = await prisma.supplier.update({
      where: { id: parsedId },
      data,
    });
    return NextResponse.json(supplier);
  } catch (e) {
    console.error("Update supplier error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid supplier id" }, { status: 400 });
    }

    const row = await prisma.supplier.findUnique({
      where: { id: parsedId },
      select: { branchId: true },
    });
    if (!row) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, row.branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.supplier.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete supplier error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
