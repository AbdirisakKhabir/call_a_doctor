import type { PrismaClient } from "@prisma/client";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";
import { serializePatient } from "@/lib/patient-name";

export const PAYMENT_DUE_CATEGORIES = [
  "medication",
  "laboratory",
  "prescription",
  "pharmacy_credit",
] as const;

export type PaymentDueCategory = (typeof PAYMENT_DUE_CATEGORIES)[number];

export type PaymentDueBucket = {
  category: PaymentDueCategory;
  label: string;
  section: "services" | "credit";
  due: number;
};

export type LabOrderDue = {
  id: number;
  remaining: number;
  totalAmount: number;
  createdAt: string;
  doctorName: string | null;
};

export type PatientPaymentDue = {
  patient: {
    id: number;
    patientCode: string;
    name: string;
    accountBalance: number;
  };
  accountBalance: number;
  servicesDue: number;
  creditDue: number;
  buckets: PaymentDueBucket[];
  labOrders: LabOrderDue[];
};

function paidByCategory(rows: { category: string; amount: number; discount: number }[]) {
  const map: Record<PaymentDueCategory, number> = {
    medication: 0,
    laboratory: 0,
    prescription: 0,
    pharmacy_credit: 0,
  };
  for (const p of rows) {
    const cat = p.category as PaymentDueCategory;
    if (!(cat in map)) continue;
    map[cat] = roundMoney(map[cat] + (p.amount ?? 0) + (p.discount ?? 0));
  }
  return map;
}

function take(due: number, leftover: number) {
  const n = roundMoney(Math.min(Math.max(0, due), Math.max(0, leftover)));
  return n;
}

/**
 * Suggested amounts still owed, split by service vs credit, capped to the live account balance.
 */
export async function getPatientPaymentDue(
  prisma: PrismaClient,
  patientId: number
): Promise<PatientPaymentDue | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      accountBalance: true,
    },
  });
  if (!patient) return null;

  const balance = roundMoney(Math.max(0, patient.accountBalance ?? 0));

  const [labOrders, payments, appointments, outreach, prescriptions] = await Promise.all([
    prisma.labOrder.findMany({
      where: { patientId, status: { not: "cancelled" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        totalAmount: true,
        labFeePaidAmount: true,
        labFeeDiscountAmount: true,
        createdAt: true,
        doctor: { select: { name: true } },
      },
    }),
    prisma.patientPayment.findMany({
      where: { patientId, cancelledAt: null },
      select: { category: true, amount: true, discount: true },
    }),
    prisma.appointment.findMany({
      where: { patientId, status: { not: "cancelled" } },
      select: {
        totalAmount: true,
        postedChargesToPatientOnCreate: true,
        sales: {
          where: { kind: "appointment" },
          select: {
            totalAmount: true,
            depositTransaction: { select: { amount: true } },
          },
        },
      },
    }),
    prisma.outreachDispense.findMany({
      where: { patientId },
      select: { totalAmount: true },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      select: {
        items: {
          select: { quantity: true, product: { select: { sellingPrice: true } } },
        },
      },
    }),
  ]);

  const labOrdersDue: LabOrderDue[] = [];
  let labTracked = 0;
  for (const o of labOrders) {
    const remaining = labOrderFeeRemaining(o);
    if (remaining <= 0.01) continue;
    labTracked = roundMoney(labTracked + remaining);
    labOrdersDue.push({
      id: o.id,
      remaining,
      totalAmount: roundMoney(o.totalAmount),
      createdAt: o.createdAt.toISOString(),
      doctorName: o.doctor?.name ?? null,
    });
  }

  const paid = paidByCategory(payments);

  let calendarCharged = 0;
  for (const a of appointments) {
    const sale = a.sales[0];
    if (sale) {
      const deposited = sale.depositTransaction?.amount ?? 0;
      calendarCharged += Math.max(0, (sale.totalAmount ?? 0) - deposited);
    } else if (a.postedChargesToPatientOnCreate) {
      calendarCharged += a.totalAmount ?? 0;
    }
  }
  calendarCharged = roundMoney(calendarCharged);
  const calendarDueRaw = roundMoney(Math.max(0, calendarCharged - paid.medication));

  const outreachCharged = roundMoney(outreach.reduce((s, r) => s + (r.totalAmount ?? 0), 0));
  const creditDueRaw = roundMoney(Math.max(0, outreachCharged - paid.pharmacy_credit));

  let rxCharged = 0;
  for (const rx of prescriptions) {
    for (const it of rx.items) {
      rxCharged += (it.product.sellingPrice ?? 0) * it.quantity;
    }
  }
  rxCharged = roundMoney(rxCharged);
  const rxDueRaw = roundMoney(Math.max(0, rxCharged - paid.prescription));

  const labDue = take(labTracked, balance);
  let leftover = roundMoney(Math.max(0, balance - labDue));

  const calendarDue = take(calendarDueRaw, leftover);
  leftover = roundMoney(leftover - calendarDue);

  const prescriptionDue = take(rxDueRaw, leftover);
  leftover = roundMoney(leftover - prescriptionDue);

  const creditDue = take(creditDueRaw, leftover);
  leftover = roundMoney(leftover - creditDue);

  // Anything still on the ledger that we could not classify stays with calendar / visit services.
  const calendarDueFinal = roundMoney(calendarDue + leftover);

  const buckets: PaymentDueBucket[] = [
    {
      category: "medication",
      label: "Calendar / visit fee",
      section: "services",
      due: calendarDueFinal,
    },
    {
      category: "laboratory",
      label: "Lab fee",
      section: "services",
      due: labDue,
    },
    {
      category: "prescription",
      label: "Prescriptions",
      section: "services",
      due: prescriptionDue,
    },
    {
      category: "pharmacy_credit",
      label: "Pharmacy credit",
      section: "credit",
      due: creditDue,
    },
  ];

  const servicesDue = roundMoney(
    buckets.filter((b) => b.section === "services").reduce((s, b) => s + b.due, 0)
  );

  return {
    patient: {
      ...serializePatient(patient),
      accountBalance: balance,
    },
    accountBalance: balance,
    servicesDue,
    creditDue,
    buckets,
    labOrders: labOrdersDue,
  };
}
