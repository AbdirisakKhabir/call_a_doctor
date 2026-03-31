import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { name, accountId, isActive } = body;

    const data: { name?: string; accountId?: number; isActive?: boolean } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof accountId !== "undefined") {
      const aid = Number(accountId);
      if (!Number.isInteger(aid)) {
        return NextResponse.json({ error: "Invalid account" }, { status: 400 });
      }
      const acc = await prisma.financeAccount.findFirst({ where: { id: aid, isActive: true } });
      if (!acc) return NextResponse.json({ error: "Invalid or inactive account" }, { status: 400 });
      data.accountId = aid;
    }
    if (typeof isActive === "boolean") data.isActive = isActive;

    const pm = await prisma.ledgerPaymentMethod.update({
      where: { id: parsedId },
      data,
      include: {
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
    });
    return NextResponse.json(pm);
  } catch (e) {
    console.error("Update payment method error:", e);
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
    if (!(await userHasPermission(auth.userId, "accounts.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const count = await prisma.accountTransaction.count({
      where: { paymentMethodId: parsedId },
    });
    if (count > 0) {
      return NextResponse.json(
        { error: "Deactivate instead; this payment method has transactions." },
        { status: 400 }
      );
    }

    await prisma.ledgerPaymentMethod.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete payment method error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
