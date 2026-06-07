import type { Prisma } from "@prisma/client";
import { createAppointmentBillingSaleInTx } from "@/lib/appointment-billing-sale";
import { deductDisposablesForCompletedAppointment } from "@/lib/service-disposable-deduction";

/**
 * Run disposable deduction + optional visit billing sale after an appointment is saved as `completed`.
 * Billing sale is created only when the visit has a positive total and a payment method is set on the booking.
 */
export async function runAppointmentCompleteSideEffectsInTx(
  tx: Prisma.TransactionClient,
  opts: {
    appointmentId: number;
    branchId: number;
    patientId: number;
    userId: number;
    paymentMethodId: number | null;
    totalAmount: number;
    billingDiscount: number;
  }
): Promise<{ billingSaleCreatedId: number | null }> {
  const ded = await deductDisposablesForCompletedAppointment(tx, {
    appointmentId: opts.appointmentId,
    branchId: opts.branchId,
    userId: opts.userId,
  });
  if (!ded.ok) {
    throw new Error(`DISPOSABLE:${ded.error}`);
  }

  let billingSaleCreatedId: number | null = null;
  if (opts.totalAmount > 0 && opts.paymentMethodId) {
    const lines = await tx.appointmentService.findMany({
      where: { appointmentId: opts.appointmentId },
      select: { serviceId: true, quantity: true, unitPrice: true, totalAmount: true },
    });
    const bill = await createAppointmentBillingSaleInTx(tx, {
      appointmentId: opts.appointmentId,
      branchId: opts.branchId,
      patientId: opts.patientId,
      userId: opts.userId,
      paymentMethodId: opts.paymentMethodId,
      discount: opts.billingDiscount,
      lines,
    });
    if (bill.created === false && bill.reason === "no_lines") {
      throw new Error("BILLING_NO_LINES");
    }
    if (bill.created) {
      billingSaleCreatedId = bill.saleId;
    }
  }

  return { billingSaleCreatedId };
}
