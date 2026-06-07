import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ok =
      (await userHasPermission(auth.userId, "financial.view")) ||
      (await userHasPermission(auth.userId, "accounts.reports"));
    if (!ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const accounts = await prisma.financeAccount.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    const ids = accounts.map((a) => a.id);

    let accountSummaries: {
      id: number;
      name: string;
      code: string | null;
      type: string;
      openingBalance: number;
      depositsInPeriod: number;
      withdrawalsInPeriod: number;
      closingBalance: number;
    }[] = [];

    if (ids.length > 0) {
      const periodStart = from ? startOfDay(new Date(from)) : null;
      const periodEnd = to ? endOfDay(new Date(to)) : null;

      const priorWhere: { accountId: { in: number[] }; transactionDate?: { lt: Date } } = {
        accountId: { in: ids },
      };
      if (periodStart) {
        priorWhere.transactionDate = { lt: periodStart };
      }

      const priorGroups = periodStart
        ? await prisma.accountTransaction.groupBy({
            by: ["accountId", "kind"],
            where: priorWhere,
            _sum: { amount: true },
          })
        : [];

      const periodWhere: {
        accountId: { in: number[] };
        transactionDate?: { gte?: Date; lte?: Date };
      } = { accountId: { in: ids } };
      if (periodStart || periodEnd) {
        periodWhere.transactionDate = {};
        if (periodStart) periodWhere.transactionDate.gte = periodStart;
        if (periodEnd) periodWhere.transactionDate.lte = periodEnd;
      }

      const periodGroups = await prisma.accountTransaction.groupBy({
        by: ["accountId", "kind"],
        where: periodWhere,
        _sum: { amount: true },
      });

      const priorNet = new Map<number, number>();
      for (const row of priorGroups) {
        const add = row.kind === "deposit" ? (row._sum.amount ?? 0) : -(row._sum.amount ?? 0);
        priorNet.set(row.accountId, (priorNet.get(row.accountId) ?? 0) + add);
      }

      const periodDep = new Map<number, number>();
      const periodWdr = new Map<number, number>();
      for (const row of periodGroups) {
        const amt = row._sum.amount ?? 0;
        if (row.kind === "deposit") {
          periodDep.set(row.accountId, (periodDep.get(row.accountId) ?? 0) + amt);
        } else {
          periodWdr.set(row.accountId, (periodWdr.get(row.accountId) ?? 0) + amt);
        }
      }

      accountSummaries = accounts.map((acc) => {
        const prior = periodStart ? priorNet.get(acc.id) ?? 0 : 0;
        const opening = acc.openingBalance + prior;
        const dep = periodDep.get(acc.id) ?? 0;
        const wdr = periodWdr.get(acc.id) ?? 0;
        const closing = opening + dep - wdr;
        return {
          id: acc.id,
          name: acc.name,
          code: acc.code,
          type: acc.type,
          openingBalance: opening,
          depositsInPeriod: dep,
          withdrawalsInPeriod: wdr,
          closingBalance: closing,
        };
      });
    }

    const totalClosingCash = accountSummaries.reduce((s, a) => s + a.closingBalance, 0);

    return NextResponse.json({
      ledgerAccounts: accountSummaries,
      totals: { closingBalancesAllAccounts: totalClosingCash },
      dateRange: { from: from ?? null, to: to ?? null },
    });
  } catch (e) {
    console.error("Account statement (ledger) error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
