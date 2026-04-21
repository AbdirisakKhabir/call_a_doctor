/** Money comparison tolerance for “fully paid” lab fee. */
export const LAB_FEE_EPS = 0.01;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isLabOrderFeeSettled(order: {
  totalAmount: number;
  labFeePaidAmount: number;
  labFeeDiscountAmount: number;
}): boolean {
  const total = order.totalAmount;
  if (total <= LAB_FEE_EPS) return true;
  const applied = order.labFeePaidAmount + order.labFeeDiscountAmount;
  return applied + LAB_FEE_EPS >= total;
}

export function labOrderFeeRemaining(order: {
  totalAmount: number;
  labFeePaidAmount: number;
  labFeeDiscountAmount: number;
}): number {
  return roundMoney(Math.max(0, order.totalAmount - order.labFeePaidAmount - order.labFeeDiscountAmount));
}
