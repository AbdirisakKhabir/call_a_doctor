import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(
      req.nextUrl.searchParams
    );

    const include = {
      account: { select: { id: true, name: true, type: true, isActive: true } },
    };

    if (paginate) {
      const [methods, total] = await Promise.all([
        prisma.ledgerPaymentMethod.findMany({
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.ledgerPaymentMethod.count(),
      ]);
      return NextResponse.json({ data: methods, total, page, pageSize });
    }

    const methods = await prisma.ledgerPaymentMethod.findMany({
      include,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(methods);
  } catch (e) {
    console.error("Payment methods list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, accountId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const aid = Number(accountId);
    if (!Number.isInteger(aid)) {
      return NextResponse.json({ error: "Account is required" }, { status: 400 });
    }

    const acc = await prisma.financeAccount.findFirst({ where: { id: aid, isActive: true } });
    if (!acc) {
      return NextResponse.json({ error: "Invalid or inactive account" }, { status: 400 });
    }

    const pm = await prisma.ledgerPaymentMethod.create({
      data: {
        name: name.trim(),
        accountId: aid,
      },
      include: {
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
    });
    return NextResponse.json(pm);
  } catch (e) {
    console.error("Create payment method error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
