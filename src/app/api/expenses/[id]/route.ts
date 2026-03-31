import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    const body = await req.json();
    const { categoryId, amount, expenseDate, description } = body;

    const data: { categoryId?: number; amount?: number; expenseDate?: Date; description?: string | null } = {};
    if (categoryId && Number.isInteger(Number(categoryId))) data.categoryId = Number(categoryId);
    const amt = Number(amount);
    if (!isNaN(amt) && amt >= 0) data.amount = amt;
    if (expenseDate) data.expenseDate = new Date(expenseDate);
    if (typeof description !== "undefined") data.description = description ? String(description).trim() : null;

    const expense = await prisma.expense.update({
      where: { id: parsedId },
      data,
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense);
  } catch (e) {
    console.error("Update expense error:", e);
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
      return NextResponse.json({ error: "Invalid expense id" }, { status: 400 });
    }

    await prisma.expense.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete expense error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
