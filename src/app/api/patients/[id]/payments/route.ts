import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

const PAYMENT_CATEGORIES = new Set(["medication", "prescription", "pharmacy_credit"]);

function categoryLabel(key: string): string {
  if (key === "prescription") return "Prescription";
  if (key === "pharmacy_credit") return "Pharmacy credits";
  return "Medication";
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
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    const payments = await prisma.patientPayment.findMany({
      where: { patientId },
      include: {
        paymentMethod: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
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
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
    }

    const body = await req.json();
    const { amount, paymentMethodId, notes } = body;
    const rawCategory =
      typeof body.category === "string" ? body.category.trim() : "";
    const category = PAYMENT_CATEGORIES.has(rawCategory)
      ? rawCategory
      : "medication";

    const pmId = Number(paymentMethodId);
    if (!Number.isInteger(pmId) || pmId <= 0) {
      return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
    }

    const rawAmount = Number(amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const balance = patient.accountBalance ?? 0;
    const payAmount = Math.min(rawAmount, balance);
    if (payAmount <= 0) {
      return NextResponse.json(
        { error: "Patient has no outstanding balance to pay" },
        { status: 400 }
      );
    }

    const pm = await prisma.ledgerPaymentMethod.findFirst({
      where: { id: pmId, isActive: true, account: { isActive: true } },
      include: { account: { select: { id: true, isActive: true } } },
    });
    if (!pm || !pm.account.isActive) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: { accountBalance: { decrement: payAmount } },
      });

      const pp = await tx.patientPayment.create({
        data: {
          patientId,
          amount: payAmount,
          category,
          paymentMethodId: pm.id,
          notes: notes ? String(notes).trim() : null,
          createdById: auth.userId,
        },
      });

      const cat = categoryLabel(category);
      await tx.accountTransaction.create({
        data: {
          accountId: pm.accountId,
          kind: "deposit",
          amount: payAmount,
          description: `Patient payment (${cat}) — ${patient.patientCode} (#${pp.id})`,
          paymentMethodId: pm.id,
          transactionDate: new Date(),
          createdById: auth.userId,
        },
      });

      const updated = await tx.patient.findUnique({
        where: { id: patientId },
        select: { id: true, accountBalance: true, patientCode: true, name: true },
      });

      return { payment: pp, patient: updated };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("Patient payment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
