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
