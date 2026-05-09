/** Daily visit-card queue slots (per branch, per calendar day). */

export const VISIT_CARD_DAILY_SLOT_COUNT = 30;

/** Valid slot integers 1..VISIT_CARD_DAILY_SLOT_COUNT stored as `DoctorVisitCard.cardNumber` (e.g. "7"). */
export function parseVisitCardSlotNumber(cardNumber: string | null | undefined): number | null {
  if (cardNumber == null || typeof cardNumber !== "string") return null;
  const n = Number(cardNumber.trim());
  if (!Number.isInteger(n) || n < 1 || n > VISIT_CARD_DAILY_SLOT_COUNT) return null;
  return n;
}

export function formatVisitCardSlotNumber(slot: number): string {
  return String(slot);
}
