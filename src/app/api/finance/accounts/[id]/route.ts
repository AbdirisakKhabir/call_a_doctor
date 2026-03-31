import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getFinanceAccountBalance } from "@/lib/finance-balance";

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
    const { name, code, type, openingBalance, isActive } = body;

    const data: {
      name?: string;
      code?: string | null;
      type?: string;
      openingBalance?: number;
      isActive?: boolean;
    } = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof code !== "undefined") data.code = code ? String(code).trim() : null;
    if (typeof type === "string") data.type = type.trim();
    if (typeof openingBalance === "number") data.openingBalance = Math.max(0, openingBalance);
    if (typeof isActive === "boolean") data.isActive = isActive;

    const acc = await prisma.financeAccount.update({
      where: { id: parsedId },
      data,
    });
    return NextResponse.json({ ...acc, balance: await getFinanceAccountBalance(acc.id) });
  } catch (e) {
    console.error("Update finance account error:", e);
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

    const count = await prisma.accountTransaction.count({ where: { accountId: parsedId } });
    if (count > 0) {
      return NextResponse.json(
        { error: "Deactivate the account instead; it has transactions." },
        { status: 400 }
      );
    }

    await prisma.ledgerPaymentMethod.deleteMany({ where: { accountId: parsedId } });
    await prisma.financeAccount.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete finance account error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
