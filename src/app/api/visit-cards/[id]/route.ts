import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getFinanceAccountBalance } from "@/lib/finance-balance";
import {
  canSeeVisitCardRow,
  getUserBranchIdFilter,
  getVisitCardAccess,
} from "@/lib/visit-card-access";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";

const visitInclude = {
  branch: { select: { id: true, name: true } },
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      mobile: true,
      address: true,
      cityId: true,
      villageId: true,
      registeredBranchId: true,
      city: { select: { id: true, name: true } },
      village: { select: { id: true, name: true } },
      registeredBranch: { select: { id: true, name: true } },
      referralSource: { select: { id: true, name: true } },
    },
  },
  doctor: { select: { id: true, name: true } },
  paymentMethod: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  depositTransaction: {
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      accountId: true,
      account: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    const { id } = await params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const card = await prisma.doctorVisitCard.findUnique({
      where: { id: cardId },
      include: visitInclude,
    });
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!canSeeVisitCardRow(access, card.doctorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    if (branchFilter && !branchFilter.includes(card.branchId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ...card, patient: serializePatient(card.patient) });
  } catch (e) {
    console.error("Visit card GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.doctorVisitCard.findUnique({
      where: { id: cardId },
      include: { depositTransaction: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!canSeeVisitCardRow(access, existing.doctorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    if (branchFilter && !branchFilter.includes(existing.branchId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      status,
      paymentStatus,
      visitFee,
      paymentMethodId,
      notes,
      transactionDate,
    } = body;

    const data: Record<string, unknown> = {};

    if (typeof status === "string" && ["inWaiting", "inProgress", "completed", "cancelled"].includes(status)) {
      data.status = status;
    }
    if (typeof notes !== "undefined") {
      data.notes = notes === null || notes === "" ? null : String(notes).trim();
    }
    if (visitFee != null && visitFee !== "") {
      const fee = Number(visitFee);
      if (Number.isNaN(fee) || fee < 0) {
        return NextResponse.json({ error: "Invalid visit fee" }, { status: 400 });
      }
      data.visitFee = fee;
    }

    const payStatuses = ["paid", "unpaid", "appointment", "free"] as const;
    let nextPaymentStatus = existing.paymentStatus;
    if (typeof paymentStatus === "string" && payStatuses.includes(paymentStatus as (typeof payStatuses)[number])) {
      nextPaymentStatus = paymentStatus;
      data.paymentStatus = paymentStatus;
    }

    let nextPmId: number | null = existing.paymentMethodId;
    if (typeof paymentMethodId !== "undefined") {
      if (paymentMethodId === null || paymentMethodId === "") {
        nextPmId = null;
        data.paymentMethodId = null;
      } else {
        const n = Number(paymentMethodId);
        if (!Number.isInteger(n)) {
          return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }
        nextPmId = n;
        data.paymentMethodId = n;
      }
    }

    const nextFee = typeof data.visitFee === "number" ? data.visitFee : existing.visitFee;

    if (existing.depositTransaction && nextPaymentStatus !== "paid") {
      return NextResponse.json(
        { error: "A ledger deposit exists; change payment only after admin removes the deposit." },
        { status: 400 }
      );
    }

    if (nextPaymentStatus === "paid" && nextFee > 0) {
      const pmForPaid = nextPmId ?? existing.paymentMethodId;
      if (!pmForPaid || !Number.isInteger(pmForPaid)) {
        return NextResponse.json(
          { error: "Payment method is required when marking as paid with a visit fee" },
          { status: 400 }
        );
      }
      if (!(await userHasPermission(auth.userId, "accounts.deposit"))) {
        return NextResponse.json(
          { error: "Recording a paid visit requires accounts.deposit permission" },
          { status: 403 }
        );
      }
    }

    const effectivePm = nextPmId ?? existing.paymentMethodId;
    const needDeposit =
      nextPaymentStatus === "paid" &&
      nextFee > 0 &&
      !existing.depositTransaction &&
      effectivePm != null &&
      Number.isInteger(effectivePm);

    const hasDataUpdate = Object.keys(data).length > 0;

    if (!hasDataUpdate && !needDeposit) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (hasDataUpdate) {
          await tx.doctorVisitCard.update({
            where: { id: cardId },
            data,
          });
        }

        if (needDeposit) {
          const pm = await tx.ledgerPaymentMethod.findFirst({
            where: { id: effectivePm!, isActive: true },
            include: { account: true },
          });
          if (!pm || !pm.account.isActive) {
            throw new Error("INVALID_PM");
          }

          await tx.accountTransaction.create({
            data: {
              accountId: pm.accountId,
              kind: "deposit",
              amount: nextFee,
              description: `Doctor visit card ${existing.cardNumber} (#${existing.id})`,
              paymentMethodId: effectivePm!,
              doctorVisitCardId: cardId,
              transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
              createdById: auth.userId,
            },
          });
        }
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_PM") {
        return NextResponse.json({ error: "Invalid or inactive payment method" }, { status: 400 });
      }
      throw e;
    }

    const fresh = await prisma.doctorVisitCard.findUnique({
      where: { id: cardId },
      include: visitInclude,
    });
    if (!fresh) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let balanceAfter: number | undefined;
    if (fresh.depositTransaction?.accountId != null) {
      balanceAfter = await getFinanceAccountBalance(fresh.depositTransaction.accountId);
    }

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "visit_card.update",
      module: "visit_cards",
      resourceType: "DoctorVisitCard",
      resourceId: cardId,
      metadata: { depositCreated: needDeposit },
    });
    return NextResponse.json({
      ...fresh,
      patient: serializePatient(fresh.patient),
      balanceAfter,
    });
  } catch (e) {
    console.error("Visit card PATCH error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
