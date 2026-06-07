import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "true";

    const categories = await prisma.expenseCategory.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (e) {
    console.error("Expense categories list error:", e);
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
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const category = await prisma.expenseCategory.create({
      data: { name: name.trim(), isActive: true },
    });
    return NextResponse.json(category);
  } catch (e) {
    console.error("Create expense category error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
