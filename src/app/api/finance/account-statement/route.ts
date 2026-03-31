import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.reports"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const accountIdParam = searchParams.get("accountId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const accountFilter =
      accountIdParam && Number.isInteger(Number(accountIdParam))
        ? { id: Number(accountIdParam) }
        : {};

    const accounts = await prisma.financeAccount.findMany({
      where: accountFilter,
      orderBy: { name: "asc" },
    });

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return NextResponse.json({
        dateRange: { from: from ?? null, to: to ?? null },
        transactions: [],
      });
    }

    const rangeStart = from ? new Date(from) : null;
    const rangeEnd = to ? new Date(to) : null;
    if (rangeEnd) rangeEnd.setHours(23, 59, 59, 999);

    const dateWhere: { transactionDate?: { gte?: Date; lte?: Date } } = {};
    if (rangeStart || rangeEnd) {
      dateWhere.transactionDate = {};
      if (rangeStart) dateWhere.transactionDate.gte = rangeStart;
      if (rangeEnd) dateWhere.transactionDate.lte = rangeEnd;
    }

    const priorTxs = rangeStart
      ? await prisma.accountTransaction.findMany({
          where: {
            accountId: { in: accountIds },
            transactionDate: { lt: rangeStart },
          },
          select: { accountId: true, kind: true, amount: true },
        })
      : [];

    const openingForPeriod = new Map<number, number>();
    for (const acc of accounts) {
      let o = acc.openingBalance;
      for (const t of priorTxs) {
        if (t.accountId !== acc.id) continue;
        o += t.kind === "deposit" ? t.amount : -t.amount;
      }
      openingForPeriod.set(acc.id, o);
    }

    const txsInRange = await prisma.accountTransaction.findMany({
      where: {
        accountId: { in: accountIds },
        ...dateWhere,
      },
      include: {
        account: { select: { id: true, name: true } },
        paymentMethod: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
    });

    const running = new Map<number, number>();
    for (const acc of accounts) {
      running.set(acc.id, openingForPeriod.get(acc.id) ?? acc.openingBalance);
    }

    const transactions = txsInRange.map((tx) => {
      const cur = running.get(tx.accountId) ?? 0;
      const delta = tx.kind === "deposit" ? tx.amount : -tx.amount;
      const next = cur + delta;
      running.set(tx.accountId, next);
      return {
        id: tx.id,
        accountId: tx.accountId,
        accountName: tx.account.name,
        kind: tx.kind,
        amount: tx.amount,
        description: tx.description,
        transactionDate: tx.transactionDate.toISOString(),
        saleId: tx.saleId,
        paymentMethod: tx.paymentMethod,
        createdBy: tx.createdBy,
        balanceAfter: next,
      };
    });

    return NextResponse.json({
      dateRange: { from: from ?? null, to: to ?? null },
      transactions,
    });
  } catch (e) {
    console.error("Account statement error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
