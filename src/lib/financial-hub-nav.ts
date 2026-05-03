/**
 * Finance sidebar (forms & lists) vs Reports → Financial reports (analytics only).
 */

export type FinancialHubNavEntry = {
  name: string;
  path: string;
  description: string;
  permission?: string;
  permissionAny?: string[];
  /** When true, submenu highlight only on exact path match. */
  exact?: boolean;
};

function entryPermissions(e: FinancialHubNavEntry): string[] {
  if (e.permissionAny?.length) return [...e.permissionAny];
  if (e.permission) return [e.permission];
  return [];
}

/** Finance section: day-to-day screens (not report summaries). */
export const FINANCE_FORMS_AND_LISTS_NAV: FinancialHubNavEntry[] = [
  {
    name: "Expenses",
    path: "/expenses",
    description: "Record and review clinic operating expenses.",
    permission: "expenses.view",
  },
  {
    name: "Client invoice",
    path: "/finance/client-invoice",
    description: "Create and print client invoices.",
    permissionAny: ["prescriptions.view", "pharmacy.view"],
  },
  {
    name: "Client balances",
    path: "/payments",
    description: "Clients with outstanding balances and payment history.",
    permissionAny: ["accounts.deposit", "pharmacy.pos"],
    exact: true,
  },
  {
    name: "Record payment",
    path: "/payments/new",
    description: "Post a payment against a client balance.",
    permissionAny: ["accounts.deposit", "pharmacy.pos"],
  },
  {
    name: "Payment list",
    path: "/finance/payments",
    description: "All recorded payments with filters.",
    permissionAny: ["accounts.deposit", "pharmacy.pos", "accounts.view"],
  },
  {
    name: "Appointment sales",
    path: "/finance/appointment-sales",
    description: "Visit billing sales linked to completed bookings.",
    permissionAny: ["pharmacy.view", "pharmacy.pos", "accounts.view", "accounts.reports", "appointments.view"],
  },
  {
    name: "Lab sales",
    path: "/finance/lab-sales",
    description: "Lab test fees and orders.",
    permissionAny: ["financial.view", "accounts.reports", "lab.view"],
  },
];

/** Reports → Financial reports: income, ledger summary, period reports. */
export const FINANCIAL_REPORTS_NAV: FinancialHubNavEntry[] = [
  {
    name: "Income statement",
    path: "/financial-reports",
    description: "Revenue, expenses, and net income for a selected period.",
    permissionAny: ["financial.view", "accounts.reports"],
    exact: true,
  },
  {
    name: "Account statement",
    path: "/finance/financial-statements",
    description: "Ledger account balances: opening, activity in range, and closing.",
    permissionAny: ["financial.view", "accounts.reports"],
  },
  {
    name: "Appointment sales report",
    path: "/reports/appointment-sales",
    description: "Spreadsheet-style summary of visit billing by period.",
    permissionAny: ["pharmacy.view", "pharmacy.pos", "accounts.view", "accounts.reports", "appointments.view"],
  },
  {
    name: "Lab sales report",
    path: "/finance/lab-sales-report",
    description: "Lab requests and fees for the selected period.",
    permissionAny: ["financial.view", "accounts.reports", "lab.view"],
  },
  {
    name: "Lab consume report",
    path: "/reports/lab-consume",
    description: "Completed lab tests and lab disposables used in a period.",
    permissionAny: ["financial.view", "accounts.reports", "lab.view"],
  },
  {
    name: "Service consume report",
    path: "/reports/service-consume",
    description: "Services provided and visit disposables consumed in a period.",
    permissionAny: ["financial.view", "accounts.reports", "appointments.view"],
  },
];

export const FINANCE_FORMS_PARENT_PERMISSION_ANY: string[] = [
  ...new Set(FINANCE_FORMS_AND_LISTS_NAV.flatMap(entryPermissions)),
];

export const FINANCIAL_REPORTS_PARENT_PERMISSION_ANY: string[] = [
  ...new Set(FINANCIAL_REPORTS_NAV.flatMap(entryPermissions)),
];

export function hubEntryVisible(
  hasPermission: (p: string) => boolean,
  e: FinancialHubNavEntry
): boolean {
  if (e.permissionAny?.length) return e.permissionAny.some((p) => hasPermission(p));
  if (e.permission) return hasPermission(e.permission);
  return false;
}
