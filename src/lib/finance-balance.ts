import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function balanceFromOpeningAndTxs(
  opening: number,
  txs: { kind: string; amount: number }[]
): number {
  let bal = opening;
  for (const t of txs) {
    if (t.kind === "deposit") bal += t.amount;
    else if (t.kind === "withdrawal") bal -= t.amount;
  }
  return bal;
}

export async function getFinanceAccountBalance(accountId: number): Promise<number> {
  const acc = await prisma.financeAccount.findUnique({
    where: { id: accountId },
    select: { openingBalance: true },
  });
  if (!acc) return 0;

  const txs = await prisma.accountTransaction.findMany({
    where: { accountId },
    select: { kind: true, amount: true },
  });

  return balanceFromOpeningAndTxs(acc.openingBalance, txs);
}

/** Same as {@link getFinanceAccountBalance} but scoped to an interactive transaction. */
export async function getFinanceAccountBalanceInTx(
  tx: Prisma.TransactionClient,
  accountId: number
): Promise<number> {
  const acc = await tx.financeAccount.findUnique({
    where: { id: accountId },
    select: { openingBalance: true },
  });
  if (!acc) return 0;

  const txs = await tx.accountTransaction.findMany({
    where: { accountId },
    select: { kind: true, amount: true },
  });

  return balanceFromOpeningAndTxs(acc.openingBalance, txs);
}
