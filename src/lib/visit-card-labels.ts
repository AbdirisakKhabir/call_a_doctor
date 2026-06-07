/** API values for `paymentStatus` */
export const PAYMENT_STATUS_VALUES = ["unpaid", "paid", "appointment", "free"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatusValue; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "appointment", label: "Appointment" },
  { value: "free", label: "Free" },
];

/** API values for visit queue `status` */
export const QUEUE_STATUS_VALUES = ["inWaiting", "inProgress", "completed", "cancelled"] as const;
export type QueueStatusValue = (typeof QUEUE_STATUS_VALUES)[number];

export const QUEUE_STATUS_OPTIONS: { value: QueueStatusValue; label: string }[] = [
  { value: "inWaiting", label: "In Waiting" },
  { value: "inProgress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function labelPaymentStatus(v: string): string {
  const row = PAYMENT_STATUS_OPTIONS.find((o) => o.value === v);
  return row?.label ?? v;
}

export function labelQueueStatus(v: string): string {
  const row = QUEUE_STATUS_OPTIONS.find((o) => o.value === v);
  return row?.label ?? v;
}

/** Tailwind classes for queue status pills (light + dark). */
export function queueStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-500/30";
    case "cancelled":
      return "bg-gray-200 text-gray-800 ring-1 ring-gray-300/80 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10";
    case "inProgress":
      return "bg-sky-100 text-sky-900 ring-1 ring-sky-200/80 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-500/30";
    case "inWaiting":
    default:
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-500/25";
  }
}

/** Tailwind classes for payment status pills. */
export function paymentStatusBadgeClass(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/25";
    case "unpaid":
      return "bg-rose-50 text-rose-900 ring-1 ring-rose-200/70 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/25";
    case "appointment":
      return "bg-violet-50 text-violet-900 ring-1 ring-violet-200/70 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-500/25";
    case "free":
      return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10";
    default:
      return "bg-gray-100 text-gray-800 ring-1 ring-gray-200/80 dark:bg-white/10 dark:text-gray-200 dark:ring-white/10";
  }
}
