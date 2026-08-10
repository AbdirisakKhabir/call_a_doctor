import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import { patientPaymentCategoryLabel } from "@/lib/patient-payment-utils";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";
import {
  loadActivePaymentGroup,
  reversePatientPaymentGroup,
  splitCashAndDiscount,
  splitMoneyEven,
  MONEY_EPS,
} from "@/lib/patient-payment-reverse";

async function canManagePayments(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "accounts.deposit")) ||
    (await userHasPermission(userId, "pharmacy.pos"))
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canManagePayments(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    const loaded = await loadActivePaymentGroup(prisma, paymentId);
    if (loaded.kind === "not_found") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (loaded.kind === "already_cancelled") {
      return NextResponse.json({ error: "This payment was cancelled or deleted" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: loaded.patientId },
      select: { id: true, patientCode: true, firstName: true, lastName: true, accountBalance: true },
    });

    const amount = loaded.group.reduce((s, p) => s + (p.amount ?? 0), 0);
    const discount = loaded.group.reduce((s, p) => s + (p.discount ?? 0), 0);
    const first = loaded.group[0];
    const paymentMethod = first?.paymentMethodId
      ? await prisma.ledgerPaymentMethod.findUnique({
          where: { id: first.paymentMethodId },
          select: { id: true, name: true },
        })
      : null;

    return NextResponse.json({
      id: paymentId,
      patient: patient ? serializePatient(patient) : null,
      amount,
      discount,
      total: amount + discount,
      paymentMethodId: first?.paymentMethodId ?? null,
      paymentMethod,
      notes: first?.notes ?? null,
      categories: loaded.group.map((p) => ({
        id: p.id,
        category: p.category,
        label: patientPaymentCategoryLabel(p.category),
        amount: p.amount,
        discount: p.discount,
        labOrderId: p.labOrderId,
      })),
      batchGroupId: first?.batchGroupId ?? null,
      createdAt: first?.createdAt ?? loaded.seed.createdAt,
    });
  } catch (e) {
    console.error("Get patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function categoryLabel(key: string): string {
  if (key === "prescription") return "Prescription";
  if (key === "pharmacy_credit") return "Pharmacy credits";
  if (key === "laboratory") return "Laboratory (lab fee)";
  return "Appointment fee";
}

function mapReverseError(e: unknown): NextResponse | null {
  if (e instanceof Error) {
    if (e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "") }, { status: 400 });
    }
    if (e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (e.message === "CONFLICT:CONCURRENT") {
      return NextResponse.json({ error: "This payment was already removed" }, { status: 409 });
    }
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canManagePayments(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    const body = await req.json();
    const rawCash = Number(body.amount);
    const rawDisc = Number(body.discount);
    const cashNum = Number.isFinite(rawCash) && rawCash > 0 ? rawCash : 0;
    const discNum = Number.isFinite(rawDisc) && rawDisc > 0 ? rawDisc : 0;
    const rawTotal = cashNum + discNum;
    if (rawTotal <= 0) {
      return NextResponse.json({ error: "Cash and/or discount must be greater than zero" }, { status: 400 });
    }
    if (cashNum > 0 && !body.paymentMethodId) {
      return NextResponse.json({ error: "Payment method is required when collecting cash" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadActivePaymentGroup(tx, paymentId);
      if (loaded.kind === "not_found") throw new Error("NOT_FOUND");
      if (loaded.kind === "already_cancelled") throw new Error("CONFLICT:CONCURRENT");

      const { group, patientId, patientCode } = loaded;
      const idsLabel = group.map((g) => g.id).join(", #");

      await reversePatientPaymentGroup(tx, {
        group,
        patientId,
        patientCode,
        userId: auth.userId,
        withdrawalDescription: `Edit client payment (reverse) — ${patientCode} (#${idsLabel})`,
      });

      const patient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!patient) throw new Error("NOT_FOUND");

      const balance = patient.accountBalance ?? 0;

      let applyTotal = Math.min(balance, rawTotal);
      if (group.length === 1 && group[0].category === "laboratory" && group[0].labOrderId) {
        const order = await tx.labOrder.findFirst({
          where: { id: group[0].labOrderId, patientId },
        });
        if (!order) throw new Error("BAD_REQUEST:Lab order for this payment is missing.");
        applyTotal = Math.min(balance, rawTotal, labOrderFeeRemaining(order));
      }
      if (applyTotal <= 0) {
        throw new Error("BAD_REQUEST:Nothing to apply — check client balance and amounts.");
      }

      const { addC, addD } = splitCashAndDiscount(cashNum, discNum, applyTotal);
      const cashParts = splitMoneyEven(addC, group.length);
      const discParts = splitMoneyEven(addD, group.length);

      let pm: { id: number; accountId: number } | null = null;
      if (addC > MONEY_EPS) {
        const pmId = Number(body.paymentMethodId);
        if (!Number.isInteger(pmId) || pmId <= 0) {
          throw new Error("BAD_REQUEST:Payment method is required when collecting cash.");
        }
        const found = await tx.ledgerPaymentMethod.findFirst({
          where: { id: pmId, isActive: true, account: { isActive: true } },
          include: { account: { select: { id: true, isActive: true } } },
        });
        if (!found || !found.account.isActive) {
          throw new Error("BAD_REQUEST:Invalid payment method");
        }
        pm = { id: found.id, accountId: found.accountId };
      }

      const notes = body.notes != null ? String(body.notes).trim() || null : group[0]?.notes ?? null;
      const batchGroupId = group[0]?.batchGroupId ?? null;

      for (let i = 0; i < group.length; i++) {
        const line = group[i];
        const lineCash = cashParts[i] ?? 0;
        const lineDisc = discParts[i] ?? 0;

        await tx.patientPayment.update({
          where: { id: line.id },
          data: {
            amount: lineCash,
            discount: lineDisc,
            paymentMethodId: pm?.id ?? null,
            notes,
          },
        });

        if (line.category === "laboratory" && line.labOrderId) {
          await tx.labOrder.update({
            where: { id: line.labOrderId },
            data: {
              labFeePaidAmount: { increment: lineCash },
              labFeeDiscountAmount: { increment: lineDisc },
            },
          });
        }
      }

      await tx.patient.update({
        where: { id: patientId },
        data: { accountBalance: { decrement: applyTotal } },
      });

      if (addC > MONEY_EPS && pm) {
        const cats = group.map((p) => categoryLabel(p.category)).join(", ");
        await tx.accountTransaction.create({
          data: {
            accountId: pm.accountId,
            kind: "deposit",
            amount: addC,
            patientPaymentBatchId: batchGroupId,
            description: `Client payment edit (${cats}) — ${patientCode} (#${idsLabel})`,
            paymentMethodId: pm.id,
            transactionDate: new Date(),
            createdById: auth.userId,
          },
        });
      }

      const updatedPatient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, firstName: true, lastName: true },
      });

      return {
        paymentIds: group.map((g) => g.id),
        appliedTotal: applyTotal,
        patient: updatedPatient,
      };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient_payment.edit",
      module: "payments",
      resourceType: "PatientPayment",
      resourceId: paymentId,
      metadata: {
        paymentIds: result.paymentIds,
        appliedTotal: result.appliedTotal,
        patientId: result.patient?.id,
      },
    });

    return NextResponse.json({
      ok: true,
      paymentIds: result.paymentIds,
      appliedTotal: result.appliedTotal,
      patient: result.patient ? serializePatient(result.patient) : null,
    });
  } catch (e) {
    const mapped = mapReverseError(e);
    if (mapped) return mapped;
    console.error("Edit patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canManagePayments(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const paymentId = Number(id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadActivePaymentGroup(tx, paymentId);
      if (loaded.kind === "not_found") throw new Error("NOT_FOUND");
      if (loaded.kind === "already_cancelled") throw new Error("CONFLICT:CONCURRENT");

      const { group, patientId, patientCode } = loaded;
      const idsLabel = group.map((g) => g.id).join(", #");

      const { restore } = await reversePatientPaymentGroup(tx, {
        group,
        patientId,
        patientCode,
        userId: auth.userId,
        withdrawalDescription: `Delete client payment — ${patientCode} (#${idsLabel})`,
      });

      await tx.patientPayment.deleteMany({
        where: { id: { in: group.map((g) => g.id) } },
      });

      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, firstName: true, lastName: true },
      });

      return {
        deletedIds: group.map((g) => g.id),
        restoredToBalance: restore,
        patient,
      };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient_payment.delete",
      module: "payments",
      resourceType: "PatientPayment",
      resourceId: paymentId,
      metadata: {
        deletedIds: result.deletedIds,
        restoredToBalance: result.restoredToBalance,
        patientId: result.patient?.id,
      },
    });

    return NextResponse.json({
      ok: true,
      deletedIds: result.deletedIds,
      restoredToBalance: result.restoredToBalance,
      patient: result.patient ? serializePatient(result.patient) : null,
    });
  } catch (e) {
    const mapped = mapReverseError(e);
    if (mapped) return mapped;
    console.error("Delete patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
