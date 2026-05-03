/**
 * Human-readable titles for printed admin reports (browser print).
 */

const EXACT: Record<string, string> = {
  "/reports/sales": "Sales report",
  "/reports/purchases": "Purchase report",
  "/reports/inventory": "Inventory report",
  "/reports/categories": "Categories report",
  "/reports/suppliers": "Suppliers report",
  "/reports/opening-inventory": "Opening inventory report",
  "/reports/appointment-sales": "Appointment sales report",
  "/reports/new-members": "Client registration report",
  "/reports/outstanding-balances": "Outstanding balances report",
  "/reports/calendar-visits": "Calendar visits & services report",
  "/reports/form-submissions": "Form responses report",
  "/reports/work-schedule": "Work schedule report",
  "/reports/lab-activity": "Lab activity report",
  "/reports/lab-consume": "Lab consume report",
  "/reports/service-consume": "Service consume report",
  "/reports/services-disposables": "Services & disposables report",
  "/reports/outreach-inventory": "Field outreach inventory report",
  "/reports/outreach": "Field outreach report",
  "/reports/outreach/inventory": "Outreach team inventory report",
  "/reports/outreach/dispenses": "Outreach dispense report",
  "/reports/outreach/issuance": "Outreach issuance report",
  "/reports/outreach/returns": "Outreach returns report",
  "/financial-reports": "Financial reports",
  "/finance/financial-statements": "Account statement",
  "/finance/lab-sales-report": "Lab sales report",
};

/** Title for the receipt-style print header. */
export function getReportPrintTitle(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (EXACT[normalized]) return EXACT[normalized];

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "Report";
  const tail = parts[parts.length - 1] ?? "report";
  const words = tail.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return `${words.join(" ")} report`;
}
