import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getFinanceAccountBalance } from "@/lib/finance-balance";
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

    if (paginate) {
      const [accounts, total] = await Promise.all([
        prisma.financeAccount.findMany({
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.financeAccount.count(),
      ]);
      const withBalance = await Promise.all(
        accounts.map(async (a) => ({
          ...a,
          balance: await getFinanceAccountBalance(a.id),
        }))
      );
      return NextResponse.json({ data: withBalance, total, page, pageSize });
    }

    const accounts = await prisma.financeAccount.findMany({
      orderBy: { name: "asc" },
    });

    const withBalance = await Promise.all(
      accounts.map(async (a) => ({
        ...a,
        balance: await getFinanceAccountBalance(a.id),
      }))
    );

    return NextResponse.json(withBalance);
  } catch (e) {
    console.error("Finance accounts list error:", e);
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
    const { name, code, type, openingBalance } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const acc = await prisma.financeAccount.create({
      data: {
        name: name.trim(),
        code: code ? String(code).trim() : null,
        type: type ? String(type).trim() : "cash",
        openingBalance: Math.max(0, Number(openingBalance) || 0),
      },
    });
    return NextResponse.json({ ...acc, balance: await getFinanceAccountBalance(acc.id) });
  } catch (e) {
    console.error("Create finance account error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
