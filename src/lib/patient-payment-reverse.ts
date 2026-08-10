import type { Prisma } from "@prisma/client";
import { getFinanceAccountBalanceInTx } from "@/lib/finance-balance";
import { LAB_FEE_EPS, roundMoney } from "@/lib/lab-fee-settlement";

const MONEY_EPS = 0.02;

export type PatientPaymentGroupRow = {
  id: number;
  patientId: number;
  batchGroupId: string | null;
  amount: number;
  discount: number;
  category: string;
  labOrderId: number | null;
  paymentMethodId: number | null;
  notes: string | null;
  createdById: number | null;
  createdAt: Date;
  cancelledAt: Date | null;
};

export type LoadedPaymentGroup =
  | { kind: "not_found" }
  | { kind: "already_cancelled" }
  | {
      kind: "ok";
      seed: PatientPaymentGroupRow & { patient: { id: number; patientCode: string } };
      group: PatientPaymentGroupRow[];
      patientCode: string;
      patientId: number;
    };

export async function loadActivePaymentGroup(
  tx: Prisma.TransactionClient,
  seedId: number
): Promise<LoadedPaymentGroup> {
  const seed = await tx.patientPayment.findUnique({
    where: { id: seedId },
    include: { patient: { select: { id: true, patientCode: true } } },
  });
  if (!seed?.patient) return { kind: "not_found" };
  if (seed.cancelledAt) return { kind: "already_cancelled" };

  const group = seed.batchGroupId
    ? await tx.patientPayment.findMany({
        where: {
          batchGroupId: seed.batchGroupId,
          patientId: seed.patientId,
          cancelledAt: null,
        },
        orderBy: { id: "asc" },
      })
    : await tx.patientPayment.findMany({
        where: {
          patientId: seed.patientId,
          createdById: seed.createdById,
          createdAt: seed.createdAt,
          cancelledAt: null,
        },
        orderBy: { id: "asc" },
      });

  return {
    kind: "ok",
    seed,
    group,
    patientCode: seed.patient.patientCode,
    patientId: seed.patientId,
  };
}

async function findMatchingDeposit(
  tx: Prisma.TransactionClient,
  patientCode: string,
  paymentIds: number[],
  batchGroupId: string | null
) {
  if (batchGroupId) {
    const dep = await tx.accountTransaction.findFirst({
      where: { kind: "deposit", patientPaymentBatchId: batchGroupId },
    });
    if (dep) return dep;
  }
  const sorted = [...paymentIds].sort((a, b) => a - b);
  const bracket = `(${sorted.map((id) => `#${id}`).join(", ")})`;
  return tx.accountTransaction.findFirst({
    where: {
      kind: "deposit",
      AND: [{ description: { contains: patientCode } }, { description: { contains: bracket } }],
    },
    orderBy: { id: "desc" },
  });
}

/** Restore client balance, lab fee allocations, and reverse ledger deposit for a payment group. */
export async function reversePatientPaymentGroup(
  tx: Prisma.TransactionClient,
  args: {
    group: PatientPaymentGroupRow[];
    patientId: number;
    patientCode: string;
    userId: number;
    withdrawalDescription: string;
  }
): Promise<{ restore: number; cash: number }> {
  const restore = roundMoney(args.group.reduce((s, p) => s + (p.amount ?? 0) + (p.discount ?? 0), 0));
  const cash = roundMoney(args.group.reduce((s, p) => s + (p.amount ?? 0), 0));

  if (restore <= 0) {
    throw new Error("BAD_REQUEST:Nothing to reverse on this payment");
  }

  for (const p of args.group) {
    if (p.category === "laboratory" && p.labOrderId != null) {
      const order = await tx.labOrder.findFirst({
        where: { id: p.labOrderId, patientId: args.patientId },
      });
      if (!order) {
        throw new Error("BAD_REQUEST:Lab order for this payment is missing.");
      }
      if (order.labFeePaidAmount + LAB_FEE_EPS < p.amount || order.labFeeDiscountAmount + LAB_FEE_EPS < p.discount) {
        throw new Error("BAD_REQUEST:Lab fee totals would go negative — this payment cannot be reversed safely.");
      }
      await tx.labOrder.update({
        where: { id: p.labOrderId },
        data: {
          labFeePaidAmount: { decrement: p.amount },
          labFeeDiscountAmount: { decrement: p.discount },
        },
      });
    }
  }

  await tx.patient.update({
    where: { id: args.patientId },
    data: { accountBalance: { increment: restore } },
  });

  if (cash > MONEY_EPS) {
    const deposit = await findMatchingDeposit(
      tx,
      args.patientCode,
      args.group.map((g) => g.id),
      args.group[0]?.batchGroupId ?? null
    );
    if (!deposit) {
      throw new Error(
        "BAD_REQUEST:Could not find the ledger deposit for this payment. Resolve in Accounting or contact support."
      );
    }
    if (Math.abs(deposit.amount - cash) > MONEY_EPS) {
      throw new Error(
        "BAD_REQUEST:Ledger deposit amount does not match this payment. Resolve in Accounting before continuing."
      );
    }
    const acctBal = await getFinanceAccountBalanceInTx(tx, deposit.accountId);
    if (acctBal + MONEY_EPS < cash) {
      throw new Error(
        `BAD_REQUEST:Insufficient balance in account to reverse the deposit ($${acctBal.toFixed(2)} available, $${cash.toFixed(2)} needed).`
      );
    }
    await tx.accountTransaction.create({
      data: {
        accountId: deposit.accountId,
        kind: "withdrawal",
        amount: cash,
        description: args.withdrawalDescription,
        paymentMethodId: deposit.paymentMethodId,
        transactionDate: new Date(),
        createdById: args.userId,
      },
    });
  }

  return { restore, cash };
}

export function splitMoneyEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(roundMoney(total) * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = base + (i < remainder ? 1 : 0);
    parts.push(c / 100);
  }
  return parts;
}

export function splitCashAndDiscount(
  rawCash: number,
  rawDisc: number,
  applyTotal: number
): { addC: number; addD: number } {
  const rawT = rawCash + rawDisc;
  if (rawT <= 0 || applyTotal <= 0) return { addC: 0, addD: 0 };
  const r = applyTotal / rawT;
  const addC = roundMoney(rawCash * r);
  const addD = roundMoney(applyTotal - addC);
  return { addC, addD };
}

export { MONEY_EPS };
