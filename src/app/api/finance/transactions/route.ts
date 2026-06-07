import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getFinanceAccountBalance } from "@/lib/finance-balance";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "accounts.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const kind = searchParams.get("kind");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where: {
      accountId?: number;
      kind?: string;
      transactionDate?: { gte?: Date; lte?: Date };
    } = {};

    if (accountId && Number.isInteger(Number(accountId))) {
      where.accountId = Number(accountId);
    }
    if (kind === "deposit" || kind === "withdrawal") {
      where.kind = kind;
    }
    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate.gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        where.transactionDate.lte = t;
      }
    }

    const include = {
      account: { select: { id: true, name: true, code: true } },
      paymentMethod: { select: { id: true, name: true } },
      sale: { select: { id: true, totalAmount: true, saleDate: true } },
      createdBy: { select: { id: true, name: true } },
    };

    if (paginate) {
      const [rows, total] = await Promise.all([
        prisma.accountTransaction.findMany({
          where,
          include,
          orderBy: { transactionDate: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.accountTransaction.count({ where }),
      ]);
      return NextResponse.json({ data: rows, total, page, pageSize });
    }

    const rows = await prisma.accountTransaction.findMany({
      where,
      include,
      orderBy: { transactionDate: "desc" },
      take: 500,
    });

    return NextResponse.json(rows);
  } catch (e) {
    console.error("Finance transactions list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { kind, amount, description, transactionDate, saleId, paymentMethodId, accountId } = body;

    if (kind === "deposit") {
      if (!(await userHasPermission(auth.userId, "accounts.deposit"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const pmid = Number(paymentMethodId);
      if (!Number.isInteger(pmid)) {
        return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
      }

      const pm = await prisma.ledgerPaymentMethod.findFirst({
        where: { id: pmid, isActive: true },
        include: { account: true },
      });
      if (!pm || !pm.account.isActive) {
        return NextResponse.json({ error: "Invalid or inactive payment method" }, { status: 400 });
      }

      const sid = saleId != null && saleId !== "" ? Number(saleId) : null;
      let amt = Number(amount);
      if (sid != null && Number.isInteger(sid)) {
        const existing = await prisma.accountTransaction.findUnique({
          where: { saleId: sid },
        });
        if (existing) {
          return NextResponse.json({ error: "This sale is already deposited" }, { status: 400 });
        }

        const sale = await prisma.sale.findUnique({ where: { id: sid } });
        if (!sale) {
          return NextResponse.json({ error: "Sale not found" }, { status: 404 });
        }
        amt = sale.totalAmount;
      }

      if (isNaN(amt) || amt <= 0) {
        return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
      }

      const tx = await prisma.accountTransaction.create({
        data: {
          accountId: pm.accountId,
          kind: "deposit",
          amount: amt,
          description: description ? String(description).trim() : null,
          ...(sid != null && Number.isInteger(sid) ? { saleId: sid } : {}),
          paymentMethodId: pmid,
          transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
          createdById: auth.userId,
        },
        include: {
          account: { select: { id: true, name: true } },
          paymentMethod: { select: { id: true, name: true } },
          sale: { select: { id: true, totalAmount: true } },
        },
      });

      await logAuditFromRequest(req, {
        userId: auth.userId,
        action: "finance.transaction.deposit",
        module: "accounts",
        resourceType: "AccountTransaction",
        resourceId: tx.id,
        metadata: { amount: tx.amount, saleId: sid ?? null, accountId: pm.accountId },
      });
      return NextResponse.json({ ...tx, balanceAfter: await getFinanceAccountBalance(pm.accountId) });
    }

    if (kind === "withdrawal") {
      if (!(await userHasPermission(auth.userId, "accounts.withdraw"))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const aid = Number(accountId);
      if (!Number.isInteger(aid)) {
        return NextResponse.json({ error: "Account is required" }, { status: 400 });
      }

      const amt = Number(amount);
      if (isNaN(amt) || amt <= 0) {
        return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
      }

      const acc = await prisma.financeAccount.findFirst({ where: { id: aid, isActive: true } });
      if (!acc) {
        return NextResponse.json({ error: "Invalid or inactive account" }, { status: 400 });
      }

      const balance = await getFinanceAccountBalance(aid);
      if (amt > balance) {
        return NextResponse.json(
          { error: `Insufficient balance. Available: $${balance.toFixed(2)}` },
          { status: 400 }
        );
      }

      const tx = await prisma.accountTransaction.create({
        data: {
          accountId: aid,
          kind: "withdrawal",
          amount: amt,
          description: description ? String(description).trim() : null,
          transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
          createdById: auth.userId,
        },
        include: {
          account: { select: { id: true, name: true } },
        },
      });

      await logAuditFromRequest(req, {
        userId: auth.userId,
        action: "finance.transaction.withdrawal",
        module: "accounts",
        resourceType: "AccountTransaction",
        resourceId: tx.id,
        metadata: { amount: tx.amount, accountId: aid },
      });
      return NextResponse.json({ ...tx, balanceAfter: await getFinanceAccountBalance(aid) });
    }

    return NextResponse.json({ error: "kind must be deposit or withdrawal" }, { status: 400 });
  } catch (e) {
    console.error("Finance transaction create error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
