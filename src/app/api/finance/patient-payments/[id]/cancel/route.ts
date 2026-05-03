import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFinanceAccountBalanceInTx } from "@/lib/finance-balance";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import { LAB_FEE_EPS, roundMoney } from "@/lib/lab-fee-settlement";

const MONEY_EPS = 0.02;

async function loadActivePaymentGroup(tx: Prisma.TransactionClient, seedId: number) {
  const seed = await tx.patientPayment.findUnique({
    where: { id: seedId },
    include: { patient: { select: { id: true, patientCode: true } } },
  });
  if (!seed?.patient) return { kind: "not_found" as const };
  if (seed.cancelledAt) return { kind: "already_cancelled" as const };

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
    kind: "ok" as const,
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canCancel =
      (await userHasPermission(auth.userId, "accounts.deposit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos"));
    if (!canCancel) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    const pre = await loadActivePaymentGroup(prisma, paymentId);
    if (pre.kind === "not_found") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (pre.kind === "already_cancelled") {
      return NextResponse.json({ error: "This payment was already cancelled" }, { status: 400 });
    }

    const totalRestore = roundMoney(
      pre.group.reduce((s, p) => s + (p.amount ?? 0) + (p.discount ?? 0), 0)
    );
    if (totalRestore <= 0) {
      return NextResponse.json({ error: "Nothing to reverse on this payment" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadActivePaymentGroup(tx, paymentId);
      if (loaded.kind !== "ok") {
        throw new Error(loaded.kind === "already_cancelled" ? "CONFLICT:CONCURRENT" : "NOT_FOUND");
      }
      const { group, patientId, patientCode } = loaded;

      const restore = roundMoney(group.reduce((s, p) => s + (p.amount ?? 0) + (p.discount ?? 0), 0));
      const cash = roundMoney(group.reduce((s, p) => s + (p.amount ?? 0), 0));

      for (const p of group) {
        if (p.category === "laboratory" && p.labOrderId != null) {
          const order = await tx.labOrder.findFirst({
            where: { id: p.labOrderId, patientId },
          });
          if (!order) {
            throw new Error("BAD_REQUEST:Lab order for this payment is missing.");
          }
          if (order.labFeePaidAmount + LAB_FEE_EPS < p.amount || order.labFeeDiscountAmount + LAB_FEE_EPS < p.discount) {
            throw new Error(
              "BAD_REQUEST:Lab fee totals would go negative — this payment cannot be cancelled safely."
            );
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
        where: { id: patientId },
        data: { accountBalance: { increment: restore } },
      });

      if (cash > MONEY_EPS) {
        const deposit = await findMatchingDeposit(
          tx,
          patientCode,
          group.map((g) => g.id),
          group[0]?.batchGroupId ?? null
        );
        if (!deposit) {
          throw new Error(
            "BAD_REQUEST:Could not find the ledger deposit for this payment. Cancel from Accounting or contact support."
          );
        }
        if (Math.abs(deposit.amount - cash) > MONEY_EPS) {
          throw new Error(
            "BAD_REQUEST:Ledger deposit amount does not match this payment. Resolve in Accounting before cancelling."
          );
        }
        const acctBal = await getFinanceAccountBalanceInTx(tx, deposit.accountId);
        if (acctBal + MONEY_EPS < cash) {
          throw new Error(
            `BAD_REQUEST:Insufficient balance in account to reverse the deposit ($${acctBal.toFixed(2)} available, $${cash.toFixed(2)} needed).`
          );
        }
        const idsLabel = group.map((g) => g.id).join(", #");
        await tx.accountTransaction.create({
          data: {
            accountId: deposit.accountId,
            kind: "withdrawal",
            amount: cash,
            description: `Cancel client payment — ${patientCode} (#${idsLabel})`,
            paymentMethodId: deposit.paymentMethodId,
            transactionDate: new Date(),
            createdById: auth.userId,
          },
        });
      }

      const now = new Date();
      await tx.patientPayment.updateMany({
        where: { id: { in: group.map((g) => g.id) } },
        data: { cancelledAt: now, cancelledById: auth.userId },
      });

      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, firstName: true, lastName: true },
      });

      return {
        patient,
        cancelledIds: group.map((g) => g.id),
        restoredToBalance: restore,
        reversedDeposit: cash > MONEY_EPS,
      };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient_payment.cancel",
      module: "payments",
      resourceType: "PatientPayment",
      resourceId: paymentId,
      metadata: {
        patientId: result.patient?.id ?? pre.patientId,
        cancelledIds: result.cancelledIds,
        restoredToBalance: result.restoredToBalance,
        reversedDeposit: result.reversedDeposit,
      },
    });

    return NextResponse.json({
      ok: true,
      cancelledIds: result.cancelledIds,
      restoredToBalance: result.restoredToBalance,
      patient: result.patient ? serializePatient(result.patient) : null,
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith("BAD_REQUEST:")) {
        return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "") }, { status: 400 });
      }
      if (e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }
      if (e.message === "CONFLICT:CONCURRENT") {
        return NextResponse.json({ error: "This payment was already cancelled" }, { status: 409 });
      }
    }
    console.error("Cancel patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
