import type { Prisma, PrismaClient } from "@prisma/client";

export const CARE_FILE_STATUS_OPEN = "open";
export const CARE_FILE_STATUS_CLOSED = "closed";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function fileCodeForNew(patientId: number): string {
  return `CF-${patientId}-${Date.now()}`;
}

/** Returns the patient’s single open care file, or creates one with a unique code. */
export async function ensureOpenCareFile(tx: Tx, patientId: number) {
  const existing = await tx.patientCareFile.findFirst({
    where: { patientId, status: CARE_FILE_STATUS_OPEN },
    orderBy: { openedAt: "desc" },
  });
  if (existing) return existing;
  return tx.patientCareFile.create({
    data: {
      patientId,
      status: CARE_FILE_STATUS_OPEN,
      fileCode: fileCodeForNew(patientId),
    },
  });
}

/** Closes all open care files for the patient and creates a new open file. */
export async function closeOpenCareFilesAndCreateNew(tx: Tx, patientId: number, title?: string | null) {
  await tx.patientCareFile.updateMany({
    where: { patientId, status: CARE_FILE_STATUS_OPEN },
    data: { status: CARE_FILE_STATUS_CLOSED, closedAt: new Date() },
  });
  return tx.patientCareFile.create({
    data: {
      patientId,
      status: CARE_FILE_STATUS_OPEN,
      fileCode: fileCodeForNew(patientId),
      title: title?.trim() || null,
    },
  });
}

export async function assertOpenCareFileForPatient(
  tx: Tx,
  patientId: number,
  careFileId: number
) {
  const cf = await tx.patientCareFile.findFirst({
    where: { id: careFileId, patientId, status: CARE_FILE_STATUS_OPEN },
  });
  if (!cf) {
    throw new Error("BAD_REQUEST:Invalid or closed client file for this patient.");
  }
  return cf;
}

/** Any status — for attributing payments to a file after it is closed. */
export async function assertCareFileForPatient(tx: Tx, patientId: number, careFileId: number) {
  const cf = await tx.patientCareFile.findFirst({
    where: { id: careFileId, patientId },
  });
  if (!cf) {
    throw new Error("BAD_REQUEST:Client file not found for this patient.");
  }
  return cf;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Roll-up charges and payments on file for invoices and balances. */
export async function buildCareFileInvoicePayload(prisma: PrismaClient | Tx, careFileId: number) {
  const file = await prisma.patientCareFile.findUnique({
    where: { id: careFileId },
    include: {
      patient: {
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          accountBalance: true,
        },
      },
    },
  });
  if (!file) return null;

  const [
    appointments,
    labOrders,
    visitCards,
    prescriptions,
    histories,
    payments,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { careFileId },
      orderBy: [{ appointmentDate: "asc" }, { id: "asc" }],
      include: {
        branch: { select: { name: true } },
        doctor: { select: { name: true } },
        services: { include: { service: { select: { name: true } } } },
      },
    }),
    prisma.labOrder.findMany({
      where: { careFileId },
      orderBy: { createdAt: "asc" },
      include: {
        doctor: { select: { name: true } },
        items: { include: { labTest: { select: { name: true } } } },
      },
    }),
    prisma.doctorVisitCard.findMany({
      where: { careFileId },
      orderBy: { visitDate: "asc" },
      include: { doctor: { select: { name: true } }, branch: { select: { name: true } } },
    }),
    prisma.prescription.findMany({
      where: { careFileId },
      orderBy: { createdAt: "asc" },
      include: {
        doctor: { select: { name: true } },
        appointment: {
          select: {
            appointmentDate: true,
            startTime: true,
            branch: { select: { name: true } },
          },
        },
        items: {
          include: {
            product: { select: { name: true, code: true, sellingPrice: true } },
          },
        },
      },
    }),
    prisma.patientHistory.findMany({
      where: { careFileId },
      orderBy: { createdAt: "asc" },
      include: { doctor: { select: { name: true } }, appointment: { select: { appointmentDate: true } } },
    }),
    prisma.patientPayment.findMany({
      where: { careFileId },
      orderBy: { createdAt: "asc" },
      include: { paymentMethod: { select: { name: true } } },
    }),
  ]);

  const appointmentTotal = roundMoney(appointments.reduce((s, a) => s + (a.totalAmount ?? 0), 0));
  const labTotal = roundMoney(labOrders.reduce((s, o) => s + (o.totalAmount ?? 0), 0));

  let visitOutstanding = 0;
  const visitLines: { id: number; label: string; amount: number; detail: string }[] = [];
  for (const v of visitCards) {
    const owe = v.paymentStatus === "unpaid" && (v.visitFee ?? 0) > 0 ? v.visitFee : 0;
    visitOutstanding += owe;
    visitLines.push({
      id: v.id,
      label: `Visit card ${v.cardNumber}`,
      amount: roundMoney(owe),
      detail: `${v.branch.name} · ${v.doctor.name} · ${v.visitDate.toISOString().slice(0, 10)} · ${v.paymentStatus}`,
    });
  }
  visitOutstanding = roundMoney(visitOutstanding);

  let prescriptionEstimated = 0;
  const rxLines: {
    prescriptionId: number;
    prescriptionDate: string;
    doctorName: string;
    branchName: string;
    productName: string;
    productCode: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    dosage: string | null;
  }[] = [];

  for (const rx of prescriptions) {
    const d = rx.appointment.appointmentDate.toISOString().slice(0, 10);
    for (const it of rx.items) {
      const unit = it.product.sellingPrice ?? 0;
      const line = roundMoney(unit * it.quantity);
      prescriptionEstimated += line;
      rxLines.push({
        prescriptionId: rx.id,
        prescriptionDate: d,
        doctorName: rx.doctor.name,
        branchName: rx.appointment.branch.name,
        productName: it.product.name,
        productCode: it.product.code,
        quantity: it.quantity,
        unitPrice: roundMoney(unit),
        lineTotal: line,
        dosage: it.dosage,
      });
    }
  }
  prescriptionEstimated = roundMoney(prescriptionEstimated);

  const chargesTotal = roundMoney(appointmentTotal + labTotal + visitOutstanding + prescriptionEstimated);

  const paymentsTotal = roundMoney(
    payments.reduce((s, p) => s + (p.amount ?? 0) + (p.discount ?? 0), 0)
  );
  const remainingOnFile = roundMoney(Math.max(0, chargesTotal - paymentsTotal));

  const out = {
    file: {
      id: file.id,
      fileCode: file.fileCode,
      title: file.title,
      status: file.status,
      openedAt: file.openedAt.toISOString(),
      closedAt: file.closedAt?.toISOString() ?? null,
      invoicedAt: file.invoicedAt?.toISOString() ?? null,
      notes: file.notes,
    },
    patient: file.patient,
    sections: {
      appointments: appointments.map((a) => ({
        id: a.id,
        date: a.appointmentDate.toISOString().slice(0, 10),
        startTime: a.startTime,
        branch: a.branch.name,
        doctor: a.doctor.name,
        totalAmount: roundMoney(a.totalAmount ?? 0),
        services: a.services.map((s) => ({
          name: s.service.name,
          quantity: s.quantity,
          unitPrice: roundMoney(s.unitPrice),
          totalAmount: roundMoney(s.totalAmount),
        })),
      })),
      labOrders: labOrders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        doctor: o.doctor.name,
        totalAmount: roundMoney(o.totalAmount ?? 0),
        status: o.status,
        tests: o.items.map((i) => ({ name: i.labTest.name, unitPrice: roundMoney(i.unitPrice) })),
      })),
      visitCards: visitLines,
      prescriptions: rxLines,
      clinicalNotes: histories.map((h) => ({
        id: h.id,
        type: h.type,
        createdAt: h.createdAt.toISOString(),
        doctor: h.doctor.name,
        appointmentDate: h.appointment?.appointmentDate?.toISOString().slice(0, 10) ?? null,
        preview: h.notes.length > 200 ? `${h.notes.slice(0, 200)}…` : h.notes,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        amount: roundMoney(p.amount),
        discount: roundMoney(p.discount ?? 0),
        category: p.category,
        paymentMethod: p.paymentMethod?.name ?? null,
        notes: p.notes,
      })),
    },
    totals: {
      appointments: appointmentTotal,
      laboratory: labTotal,
      visitCardsOutstanding: visitOutstanding,
      prescriptionsEstimated: prescriptionEstimated,
      charges: chargesTotal,
      payments: paymentsTotal,
      remainingOnFile,
    },
  };
  return out;
}

export type CareFileInvoicePayload = NonNullable<Awaited<ReturnType<typeof buildCareFileInvoicePayload>>>;
