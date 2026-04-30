import type { Prisma } from "@prisma/client";

/** SaleItem.saleUnit for visit billing rows (not a product packaging key). */
export const APPOINTMENT_SERVICE_SALE_UNIT = "service";

export type AppointmentBillingSaleResult =
  | { created: false; reason: "exists" | "no_lines" }
  | { created: true; saleId: number; finalTotal: number };

/**
 * Creates a patient sale from booked service lines (no inventory movement), with optional till deposit and patient balance for any remainder.
 * Idempotent per appointment: skips if a sale with kind `appointment` already exists for this appointment.
 */
export async function createAppointmentBillingSaleInTx(
  tx: Prisma.TransactionClient,
  args: {
    appointmentId: number;
    branchId: number;
    patientId: number;
    userId: number;
    paymentMethodId: number;
    discount: number;
    /** Cash/card taken now; remainder stays on patient account. Omit or use invoice total for pay-in-full. */
    paidNow?: number;
    lines: { serviceId: number; quantity: number; unitPrice: number; totalAmount: number }[];
  }
): Promise<AppointmentBillingSaleResult> {
  const existing = await tx.sale.findFirst({
    where: { appointmentId: args.appointmentId, kind: "appointment" },
    select: { id: true },
  });
  if (existing) {
    return { created: false, reason: "exists" };
  }

  const lines = args.lines.filter(
    (l) =>
      Number.isInteger(l.serviceId) &&
      l.serviceId > 0 &&
      l.quantity > 0 &&
      l.totalAmount >= 0
  );
  if (lines.length === 0) {
    return { created: false, reason: "no_lines" };
  }

  const subtotal = lines.reduce((s, l) => s + l.totalAmount, 0);
  const discount = Math.min(subtotal, Math.max(0, args.discount));
  const finalTotal = Math.max(0, subtotal - discount);
  const rawPaid =
    args.paidNow !== undefined && args.paidNow !== null && Number.isFinite(Number(args.paidNow))
      ? Number(args.paidNow)
      : finalTotal;
  const paidDeposit = Math.min(finalTotal, Math.max(0, rawPaid));
  const balanceOwed = finalTotal - paidDeposit;

  const ledgerPm = await tx.ledgerPaymentMethod.findFirst({
    where: { id: args.paymentMethodId, isActive: true, account: { isActive: true } },
    include: { account: { select: { id: true } } },
  });
  if (!ledgerPm) {
    throw new Error("INVALID_PAYMENT_METHOD");
  }

  const sale = await tx.sale.create({
    data: {
      branchId: args.branchId,
      totalAmount: finalTotal,
      discount,
      paymentMethod: ledgerPm.name,
      notes: `Appointment #${args.appointmentId} · visit billing`,
      patientId: args.patientId,
      customerType: "patient",
      createdById: args.userId,
      appointmentId: args.appointmentId,
      kind: "appointment",
      items: {
        create: lines.map((l) => ({
          serviceId: l.serviceId,
          productId: null,
          quantity: l.quantity,
          saleUnit: APPOINTMENT_SERVICE_SALE_UNIT,
          unitPrice: l.unitPrice,
          totalAmount: l.totalAmount,
        })),
      },
    },
  });

  if (paidDeposit > 0) {
    await tx.accountTransaction.create({
      data: {
        accountId: ledgerPm.accountId,
        kind: "deposit",
        amount: paidDeposit,
        description: `Visit billing · Appointment #${args.appointmentId} · Sale #${sale.id}`,
        saleId: sale.id,
        paymentMethodId: ledgerPm.id,
        transactionDate: new Date(),
        createdById: args.userId,
      },
    });
  }
  if (balanceOwed > 0) {
    await tx.patient.update({
      where: { id: args.patientId },
      data: { accountBalance: { increment: balanceOwed } },
    });
  }

  return { created: true, saleId: sale.id, finalTotal };
}
