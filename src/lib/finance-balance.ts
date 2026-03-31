import { prisma } from "@/lib/prisma";

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

  let bal = acc.openingBalance;
  for (const t of txs) {
    if (t.kind === "deposit") bal += t.amount;
    else if (t.kind === "withdrawal") bal -= t.amount;
  }
  return bal;
}
