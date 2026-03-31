import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where: { categoryId?: number; expenseDate?: { gte?: Date; lte?: Date } } = {};
    if (categoryId && Number.isInteger(Number(categoryId))) {
      where.categoryId = Number(categoryId);
    }
    if (from || to) {
      where.expenseDate = {};
      if (from) where.expenseDate.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.expenseDate.lte = toDate;
      }
    }

    const query = {
      where,
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { expenseDate: "desc" as const },
    };

    if (paginate) {
      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({ ...query, skip, take: pageSize }),
        prisma.expense.count({ where }),
      ]);
      return NextResponse.json({ data: expenses, total, page, pageSize });
    }

    const expenses = await prisma.expense.findMany(query);
    return NextResponse.json(expenses);
  } catch (e) {
    console.error("Expenses list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { categoryId, amount, expenseDate, description } = body;

    if (!categoryId || !Number.isInteger(Number(categoryId))) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: Number(categoryId),
        amount: amt,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        description: description ? String(description).trim() : null,
        createdById: auth.userId,
      },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(expense);
  } catch (e) {
    console.error("Create expense error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
