export const UNSELLABLE_REASONS = ["expired", "damaged", "recall", "other"] as const;
export type UnsellableReason = (typeof UNSELLABLE_REASONS)[number];

export function isUnsellableReason(s: string): s is UnsellableReason {
  return (UNSELLABLE_REASONS as readonly string[]).includes(s);
}

export function unsellableReasonLabel(reason: string): string {
  switch (reason) {
    case "expired":
      return "Expired";
    case "damaged":
      return "Damaged";
    case "recall":
      return "Recall";
    case "other":
      return "Other";
    default:
      return reason;
  }
}
