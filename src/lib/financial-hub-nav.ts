/**
 * Finance sidebar (forms & lists) vs Reports → Financial reports (analytics only).
 */

import { PP } from "@/lib/page-permissions";

export type FinancialHubNavEntry = {
  name: string;
  path: string;
  description: string;
  /** Page permission key — user needs this to see the page in sidebar */
  permission?: string;
  /** When true, submenu highlight only on exact path match. */
  exact?: boolean;
};

/** Finance section: day-to-day screens (not report summaries). */
export const FINANCE_FORMS_AND_LISTS_NAV: FinancialHubNavEntry[] = [
  {
    name: "Expenses",
    path: "/expenses",
    description: "Record and review clinic operating expenses.",
    permission: PP.finance_expenses,
  },
  {
    name: "Client invoice",
    path: "/finance/client-invoice",
    description: "Create and print client invoices.",
    permission: PP.finance_client_invoice,
  },
  {
    name: "Client balances",
    path: "/payments",
    description: "Clients with outstanding balances and payment history.",
    permission: PP.finance_client_balances,
    exact: true,
  },
  {
    name: "Record payment",
    path: "/payments/new",
    description: "Post a payment against a client balance.",
    permission: PP.finance_record_payment,
  },
  {
    name: "Payment list",
    path: "/finance/payments",
    description: "All recorded payments with filters.",
    permission: PP.finance_payment_list,
  },
  {
    name: "Appointment sales",
    path: "/finance/appointment-sales",
    description: "Visit billing sales linked to completed bookings.",
    permission: PP.finance_appointment_sales,
  },
  {
    name: "Lab sales",
    path: "/finance/lab-sales",
    description: "Lab test fees and orders.",
    permission: PP.finance_lab_sales,
  },
];

/** Reports → Financial reports: income, ledger summary, period reports. */
export const FINANCIAL_REPORTS_NAV: FinancialHubNavEntry[] = [
  {
    name: "Income statement",
    path: "/financial-reports",
    description: "Revenue, expenses, and net income for a selected period.",
    permission: PP.reports_income_statement,
    exact: true,
  },
  {
    name: "Account statement",
    path: "/finance/financial-statements",
    description: "Ledger account balances: opening, activity in range, and closing.",
    permission: PP.reports_financial_statement,
  },
  {
    name: "Appointment sales report",
    path: "/reports/appointment-sales",
    description: "Spreadsheet-style summary of visit billing by period.",
    permission: PP.reports_appointment_sales,
  },
  {
    name: "Lab sales report",
    path: "/finance/lab-sales-report",
    description: "Lab requests and fees for the selected period.",
    permission: PP.reports_lab_sales,
  },
  {
    name: "Lab consume report",
    path: "/reports/lab-consume",
    description: "Completed lab tests and lab disposables used in a period.",
    permission: PP.reports_lab_consume,
  },
  {
    name: "Service consume report",
    path: "/reports/service-consume",
    description: "Services provided and visit disposables consumed in a period.",
    permission: PP.reports_service_consume_financial,
  },
];

export const FINANCE_FORMS_PARENT_PERMISSION_ANY: string[] = [
  ...new Set(FINANCE_FORMS_AND_LISTS_NAV.map((e) => e.permission).filter(Boolean) as string[]),
];

export const FINANCIAL_REPORTS_PARENT_PERMISSION_ANY: string[] = [
  ...new Set(FINANCIAL_REPORTS_NAV.map((e) => e.permission).filter(Boolean) as string[]),
];

export function hubEntryVisible(
  hasPermission: (p: string) => boolean,
  e: FinancialHubNavEntry
): boolean {
  if (e.permission) return hasPermission(e.permission);
  return false;
}
