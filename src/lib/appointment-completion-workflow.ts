import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAppointmentCompleteSideEffectsInTx } from "@/lib/appointment-run-complete-side-effects";

/** Yes / No / Not applicable — recorded when closing a visit from the calendar workflow. */
export const COMPLETION_TRISTATE_VALUES = ["yes", "no", "na"] as const;
export type CompletionTristate = (typeof COMPLETION_TRISTATE_VALUES)[number];

export function parseCompletionTristate(raw: unknown): CompletionTristate | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return COMPLETION_TRISTATE_VALUES.includes(v as CompletionTristate) ? (v as CompletionTristate) : null;
}

/** Needs at least one clinic form linked to the booking before status can be Completed. */
export function needsClinicFormRecorded(
  lab: CompletionTristate,
  prescription: CompletionTristate,
  clinicNote: CompletionTristate
): boolean {
  if (lab === "yes" && prescription === "yes") return true;
  if (clinicNote === "yes") return true;
  return false;
}

export async function countClinicFormsForAppointment(
  tx: Prisma.TransactionClient | typeof prisma,
  appointmentId: number
): Promise<number> {
  return tx.customFormResponse.count({ where: { appointmentId } });
}

/** After a form is submitted for this booking, move Pending → Completed when checklist requires documentation. */
export async function tryFinalizePendingAppointmentAfterForm(opts: {
  appointmentId: number;
  userId: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const apt = await tx.appointment.findUnique({
      where: { id: opts.appointmentId },
      select: {
        id: true,
        status: true,
        completionChecklistLab: true,
        completionChecklistPrescription: true,
        completionChecklistClinicNote: true,
        branchId: true,
        patientId: true,
        paymentMethodId: true,
        totalAmount: true,
      },
    });
    if (!apt || apt.status !== "pending") return;
    const lab = parseCompletionTristate(apt.completionChecklistLab);
    const rx = parseCompletionTristate(apt.completionChecklistPrescription);
    const cn = parseCompletionTristate(apt.completionChecklistClinicNote);
    if (lab == null || rx == null || cn == null) return;

    const needsForm = needsClinicFormRecorded(lab, rx, cn);
    if (!needsForm) return;

    const n = await countClinicFormsForAppointment(tx, opts.appointmentId);
    if (n < 1) return;

    await tx.appointment.update({
      where: { id: opts.appointmentId },
      data: { status: "completed" },
    });

    await runAppointmentCompleteSideEffectsInTx(tx, {
      appointmentId: opts.appointmentId,
      branchId: apt.branchId,
      patientId: apt.patientId,
      userId: opts.userId,
      paymentMethodId: apt.paymentMethodId,
      totalAmount: apt.totalAmount,
      billingDiscount: 0,
    });
  });
}
