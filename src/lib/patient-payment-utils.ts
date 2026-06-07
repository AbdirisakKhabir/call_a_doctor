/** User-facing label for `PatientPayment.category`. */
export function patientPaymentCategoryLabel(category: string): string {
  const c = category.trim();
  if (c === "prescription") return "Prescription";
  if (c === "pharmacy_credit") return "Pharmacy credits";
  if (c === "laboratory") return "Laboratory";
  return "Appointment / visit";
}
