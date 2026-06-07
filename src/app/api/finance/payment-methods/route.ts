import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { getFinanceAccountBalance } from "@/lib/finance-balance";

async function canListPaymentMethods(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "accounts.view")) ||
    (await userHasPermission(userId, "accounts.deposit")) ||
    (await userHasPermission(userId, "visit_cards.create")) ||
    (await userHasPermission(userId, "appointments.edit")) ||
    (await userHasPermission(userId, "appointments.create"))
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canListPaymentMethods(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(
      req.nextUrl.searchParams
    );

    const include = {
      account: { select: { id: true, name: true, type: true, isActive: true } },
    };

    const where = {
      isActive: true,
      account: { isActive: true },
    };

    if (paginate) {
      const [methods, total] = await Promise.all([
        prisma.ledgerPaymentMethod.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.ledgerPaymentMethod.count({ where }),
      ]);
      const accountIds = [...new Set(methods.map((m) => m.accountId))];
      const balanceMap = new Map<number, number>();
      await Promise.all(
        accountIds.map(async (aid) => {
          balanceMap.set(aid, await getFinanceAccountBalance(aid));
        })
      );
      const data = methods.map((m) => ({
        ...m,
        accountBalance: balanceMap.get(m.accountId) ?? 0,
      }));
      return NextResponse.json({ data, total, page, pageSize });
    }

    const methods = await prisma.ledgerPaymentMethod.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });
    const accountIds = [...new Set(methods.map((m) => m.accountId))];
    const balanceMap = new Map<number, number>();
    await Promise.all(
      accountIds.map(async (aid) => {
        balanceMap.set(aid, await getFinanceAccountBalance(aid));
      })
    );
    const withBalance = methods.map((m) => ({
      ...m,
      accountBalance: balanceMap.get(m.accountId) ?? 0,
    }));
    return NextResponse.json(withBalance);
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
