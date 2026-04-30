import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";

const PAYMENT_CATEGORIES = new Set(["medication", "prescription", "pharmacy_credit", "laboratory"]);

const CATEGORY_ORDER = ["medication", "prescription", "pharmacy_credit", "laboratory"] as const;

function categoryLabel(key: string): string {
  if (key === "prescription") return "Prescription";
  if (key === "pharmacy_credit") return "Pharmacy credits";
  if (key === "laboratory") return "Laboratory (lab fee)";
  return "Appointment fee";
}

function normalizePaymentCategories(body: { category?: unknown; categories?: unknown }): string[] {
  if (Array.isArray(body.categories)) {
    const seen = new Set<string>();
    for (const x of body.categories) {
      const c = typeof x === "string" ? x.trim() : "";
      if (PAYMENT_CATEGORIES.has(c)) seen.add(c);
    }
    if (seen.size === 0) return ["medication"];
    return [...seen].sort((a, b) => CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]) - CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]));
  }
  const raw = typeof body.category === "string" ? body.category.trim() : "";
  const one = PAYMENT_CATEGORIES.has(raw) ? raw : "medication";
  return [one];
}

/** `n` parts in cents that sum to roundMoney(total). */
function splitMoneyEven(total: number, n: number): number[] {
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

/** Split applied total back into cash vs discount using the same ratio as the user input. */
function splitCashAndDiscount(rawCash: number, rawDisc: number, applyTotal: number): { addC: number; addD: number } {
  const rawT = rawCash + rawDisc;
  if (rawT <= 0 || applyTotal <= 0) return { addC: 0, addD: 0 };
  const r = applyTotal / rawT;
  const addC = roundMoney(rawCash * r);
  const addD = roundMoney(applyTotal - addC);
  return { addC, addD };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const payments = await prisma.patientPayment.findMany({
      where: { patientId },
      include: {
        paymentMethod: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        labOrder: { select: { id: true, totalAmount: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(payments);
  } catch (e) {
    console.error("Patient payments list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canPay =
      (await userHasPermission(auth.userId, "accounts.deposit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos"));
    if (!canPay) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const body = await req.json();
    const { paymentMethodId, notes } = body;
    const categoryList = normalizePaymentCategories(body);
    if (categoryList.includes("laboratory") && categoryList.length > 1) {
      return NextResponse.json(
        {
          error:
            "Laboratory (lab fee) must be chosen by itself. Record other payment types separately, or uncheck Laboratory.",
        },
        { status: 400 }
      );
    }

    const rawCash = Number(body.amount);
    const rawDisc = Number(body.discount);
    const cashNum = Number.isFinite(rawCash) && rawCash > 0 ? rawCash : 0;
    const discNum = Number.isFinite(rawDisc) && rawDisc > 0 ? rawDisc : 0;
    const rawTotal = cashNum + discNum;

    if (!Number.isFinite(rawTotal) || rawTotal <= 0) {
      return NextResponse.json(
        { error: "Enter cash collected and/or discount; the sum must be greater than zero." },
        { status: 400 }
      );
    }

    let labOrderIdVal: number | null = null;
    if (categoryList.includes("laboratory")) {
      const lid = Number(body.labOrderId);
      if (!Number.isInteger(lid) || lid <= 0) {
        return NextResponse.json(
          { error: "Select a lab order when paying a laboratory fee." },
          { status: 400 }
        );
      }
      labOrderIdVal = lid;
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const balance = patient.accountBalance ?? 0;

    const result = await prisma.$transaction(async (tx) => {
      let applyTotal: number;
      let addC: number;
      let addD: number;
      let labOrderUpdate:
        | { id: number; incrementPaid: number; incrementDisc: number }
        | null = null;

      if (categoryList.includes("laboratory") && labOrderIdVal) {
        const order = await tx.labOrder.findFirst({
          where: { id: labOrderIdVal, patientId },
        });
        if (!order) {
          throw new Error("BAD_REQUEST:Lab order not found for this client.");
        }
        if (order.status === "cancelled") {
          throw new Error("BAD_REQUEST:That lab order is cancelled.");
        }
        const orderRemaining = labOrderFeeRemaining(order);
        if (orderRemaining <= 0.01) {
          throw new Error("BAD_REQUEST:This lab order is already fully paid.");
        }
        applyTotal = Math.min(balance, rawTotal, orderRemaining);
        if (applyTotal <= 0) {
          throw new Error("BAD_REQUEST:Nothing to apply (check client balance and amount).");
        }
        const split = splitCashAndDiscount(cashNum, discNum, applyTotal);
        addC = split.addC;
        addD = split.addD;
        labOrderUpdate = {
          id: order.id,
          incrementPaid: addC,
          incrementDisc: addD,
        };
      } else {
        applyTotal = Math.min(balance, rawTotal);
        if (applyTotal <= 0) {
          throw new Error("BAD_REQUEST:Client has no outstanding balance to pay.");
        }
        const split = splitCashAndDiscount(cashNum, discNum, applyTotal);
        addC = split.addC;
        addD = split.addD;
      }

      await tx.patient.update({
        where: { id: patientId },
        data: { accountBalance: { decrement: applyTotal } },
      });

      if (labOrderUpdate) {
        await tx.labOrder.update({
          where: { id: labOrderUpdate.id },
          data: {
            labFeePaidAmount: { increment: labOrderUpdate.incrementPaid },
            labFeeDiscountAmount: { increment: labOrderUpdate.incrementDisc },
          },
        });
      }

      let pm: { id: number; accountId: number } | null = null;
      if (addC > 0) {
        const pmId = Number(paymentMethodId);
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

      const n = categoryList.length;
      const cashParts = splitMoneyEven(addC, n);
      const discParts = splitMoneyEven(addD, n);
      const payments = [];
      for (let i = 0; i < n; i++) {
        const cat = categoryList[i];
        const pp = await tx.patientPayment.create({
          data: {
            patientId,
            amount: cashParts[i],
            discount: discParts[i],
            category: cat,
            paymentMethodId: pm?.id ?? null,
            labOrderId: cat === "laboratory" ? labOrderIdVal : null,
            notes: notes ? String(notes).trim() : null,
            createdById: auth.userId,
          },
        });
        payments.push(pp);
      }

      if (addC > 0 && pm) {
        const cats = categoryList.map((c) => categoryLabel(c)).join(", ");
        const ids = payments.map((p) => p.id).join(", #");
        await tx.accountTransaction.create({
          data: {
            accountId: pm.accountId,
            kind: "deposit",
            amount: addC,
            description: `Client payment (${cats}) — ${patient.patientCode} (#${ids})`,
            paymentMethodId: pm.id,
            transactionDate: new Date(),
            createdById: auth.userId,
          },
        });
      }

      const updated = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, firstName: true, lastName: true },
      });

      return { payments, patient: updated };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient_payment.record",
      module: "payments",
      resourceType: "PatientPayment",
      resourceId: result.payments[0]?.id ?? 0,
      metadata: {
        patientId,
        amount: result.payments.reduce((s, p) => s + p.amount, 0),
        discount: result.payments.reduce((s, p) => s + p.discount, 0),
        categories: categoryList,
        paymentIds: result.payments.map((p) => p.id),
        labOrderId: result.payments.find((p) => p.labOrderId)?.labOrderId ?? null,
      },
    });
    return NextResponse.json({
      payments: result.payments,
      payment: result.payments[0],
      patient: result.patient ? serializePatient(result.patient) : result.patient,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "") }, { status: 400 });
    }
    console.error("Patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
