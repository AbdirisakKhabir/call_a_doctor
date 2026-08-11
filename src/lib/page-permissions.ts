/**
 * Page-level access permissions — one per sidebar page.
 * Roles grant pages; the sidebar shows only granted pages grouped by section.
 * Legacy module permissions (pharmacy.view, etc.) are implied when a page is granted.
 */

export type PageSectionKey =
  | "overview"
  | "scheduling"
  | "clinical"
  | "pharmacy_clients"
  | "finance"
  | "reports"
  | "clinic_setup"
  | "hr"
  | "system"
  | "access_control";

export const PAGE_SECTION_TITLES: Record<PageSectionKey, string> = {
  overview: "Overview",
  scheduling: "Scheduling & reception",
  clinical: "Clinical",
  pharmacy_clients: "Pharmacy & clients",
  finance: "Finance & accounting",
  reports: "Reports",
  clinic_setup: "Clinic setup",
  hr: "Human resources",
  system: "System",
  access_control: "Access control",
};

export type PagePermissionDef = {
  /** Permission key stored in DB, e.g. pages.pharmacy.inventory */
  permission: string;
  /** Human-readable page name shown in Roles UI */
  label: string;
  section: PageSectionKey;
  path: string;
  /** Parent menu group within the section (optional) */
  menuGroup?: string;
  /** Legacy permissions implied for API / action checks */
  legacyAny?: string[];
};

function p(
  permission: string,
  label: string,
  section: PageSectionKey,
  path: string,
  opts?: { menuGroup?: string; legacyAny?: string[] }
): PagePermissionDef {
  return {
    permission,
    label,
    section,
    path,
    menuGroup: opts?.menuGroup,
    legacyAny: opts?.legacyAny,
  };
}

/** All navigable pages — source of truth for roles UI and sidebar filtering. */
export const PAGE_PERMISSIONS: PagePermissionDef[] = [
  p("pages.dashboard", "Dashboard", "overview", "/", { legacyAny: ["dashboard.view"] }),

  p("pages.appointments.calendar", "Calendar", "scheduling", "/appointments", {
    menuGroup: "Calendar",
    legacyAny: ["appointments.view"],
  }),
  p("pages.appointments.cancelled", "Cancelled bookings", "scheduling", "/appointments/cancelled", {
    menuGroup: "Calendar",
    legacyAny: ["appointments.view"],
  }),
  p("pages.visit_cards.list", "All visit cards", "scheduling", "/visit-cards", {
    menuGroup: "Visit cards",
    legacyAny: ["visit_cards.view_all", "visit_cards.view_own", "visit_cards.create"],
  }),
  p("pages.visit_cards.new", "New visit card", "scheduling", "/visit-cards/new", {
    menuGroup: "Visit cards",
    legacyAny: ["visit_cards.create"],
  }),

  p("pages.lab.orders", "Orders & results", "clinical", "/lab/orders", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.view"],
  }),
  p("pages.lab.tests", "Tests", "clinical", "/lab/tests", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.view"],
  }),
  p("pages.lab.subtests", "Sub-tests", "clinical", "/lab/tests/subtests", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.view"],
  }),
  p("pages.lab.categories", "Categories", "clinical", "/lab/categories", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.view"],
  }),
  p("pages.lab.inventory", "Lab inventory", "clinical", "/lab/inventory", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.view"],
  }),
  p("pages.lab.inventory_new", "New lab stock item", "clinical", "/lab/inventory/new", {
    menuGroup: "Laboratory",
    legacyAny: ["lab.create", "lab.edit"],
  }),
  p("pages.prescriptions", "Prescriptions", "clinical", "/prescriptions", {
    legacyAny: ["prescriptions.view"],
  }),

  p("pages.pharmacy.inventory", "Inventory", "pharmacy_clients", "/pharmacy/inventory", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.categories", "Categories", "pharmacy_clients", "/pharmacy/categories", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.purchases", "Purchases", "pharmacy_clients", "/pharmacy/purchases", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.suppliers", "Suppliers", "pharmacy_clients", "/pharmacy/suppliers", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.opening_inventory", "Opening inventory", "pharmacy_clients", "/pharmacy/opening-inventory", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.create"],
  }),
  p("pages.pharmacy.unsellable_stock", "Unsellable stock", "pharmacy_clients", "/pharmacy/unsellable-stock", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.pos", "POS", "pharmacy_clients", "/pharmacy/pos", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.pos"],
  }),
  p("pages.pharmacy.sale_returns", "Sale returns", "pharmacy_clients", "/pharmacy/sale-returns", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.pos"],
  }),
  p("pages.pharmacy.sales", "Sales list", "pharmacy_clients", "/pharmacy/sales", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.outreach_teams", "Outreach teams", "pharmacy_clients", "/pharmacy/outreach/teams", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.pharmacy.outreach_returns", "Outreach return", "pharmacy_clients", "/pharmacy/outreach/returns", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.pos"],
  }),
  p("pages.pharmacy.outreach_dispense", "Emergency medication", "pharmacy_clients", "/pharmacy/outreach/dispense", {
    menuGroup: "Pharmacy",
    legacyAny: ["pharmacy.pos"],
  }),
  p("pages.patients", "Clients", "pharmacy_clients", "/patients", {
    legacyAny: ["pharmacy.view", "patients.view"],
  }),

  p("pages.finance.expenses", "Expenses", "finance", "/expenses", {
    menuGroup: "Finance",
    legacyAny: ["expenses.view"],
  }),
  p("pages.finance.client_invoice", "Client invoice", "finance", "/finance/client-invoice", {
    menuGroup: "Finance",
    legacyAny: ["prescriptions.view", "pharmacy.view"],
  }),
  p("pages.finance.client_balances", "Client balances", "finance", "/payments", {
    menuGroup: "Finance",
    legacyAny: ["accounts.deposit", "pharmacy.pos"],
  }),
  p("pages.finance.record_payment", "Record payment", "finance", "/payments/new", {
    menuGroup: "Finance",
    legacyAny: ["accounts.deposit", "pharmacy.pos"],
  }),
  p("pages.finance.payment_list", "Payment list", "finance", "/finance/payments", {
    menuGroup: "Finance",
    legacyAny: ["accounts.deposit", "pharmacy.pos", "accounts.view"],
  }),
  p("pages.finance.appointment_sales", "Appointment sales", "finance", "/finance/appointment-sales", {
    menuGroup: "Finance",
    legacyAny: ["pharmacy.view", "pharmacy.pos", "accounts.view", "accounts.reports", "appointments.view"],
  }),
  p("pages.finance.lab_sales", "Lab sales", "finance", "/finance/lab-sales", {
    menuGroup: "Finance",
    legacyAny: ["financial.view", "accounts.reports", "lab.view"],
  }),
  p("pages.accounting.overview", "Ledger overview", "finance", "/accounting", {
    menuGroup: "Ledger & statements",
    legacyAny: ["accounts.view"],
  }),
  p("pages.accounting.accounts", "Accounts", "finance", "/settings/accounts", {
    menuGroup: "Ledger & statements",
    legacyAny: ["accounts.view"],
  }),
  p("pages.accounting.payment_methods", "Payment methods", "finance", "/settings/payment-methods", {
    menuGroup: "Ledger & statements",
    legacyAny: ["accounts.view"],
  }),
  p("pages.accounting.transactions", "Deposits & withdrawals", "finance", "/settings/account-transactions", {
    menuGroup: "Ledger & statements",
    legacyAny: ["accounts.view"],
  }),
  p("pages.accounting.statement", "Account statement", "finance", "/settings/account-statement", {
    menuGroup: "Ledger & statements",
    legacyAny: ["accounts.reports"],
  }),

  p("pages.analytics.overview", "Analytics overview", "reports", "/analytics", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view"],
  }),
  p("pages.analytics.revenue", "Revenue & finance", "reports", "/analytics/revenue", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "financial.view", "accounts.reports"],
  }),
  p("pages.analytics.appointments", "Appointments analytics", "reports", "/analytics/appointments", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "appointments.view"],
  }),
  p("pages.analytics.clients", "Clients analytics", "reports", "/analytics/clients", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "patients.view"],
  }),
  p("pages.analytics.pharmacy", "Pharmacy analytics", "reports", "/analytics/pharmacy", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "pharmacy.view", "pharmacy.pos"],
  }),
  p("pages.analytics.lab", "Laboratory analytics", "reports", "/analytics/lab", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "lab.view"],
  }),
  p("pages.analytics.doctors", "Doctor performance", "reports", "/analytics/doctors", {
    menuGroup: "Analytics",
    legacyAny: ["analytics.view", "appointments.view"],
  }),
  p("pages.reports.income_statement", "Income statement", "reports", "/financial-reports", {
    menuGroup: "Financial reports",
    legacyAny: ["financial.view", "accounts.reports"],
  }),
  p("pages.reports.financial_statement", "Account statement report", "reports", "/finance/financial-statements", {
    menuGroup: "Financial reports",
    legacyAny: ["financial.view", "accounts.reports"],
  }),
  p("pages.reports.appointment_sales", "Appointment sales report", "reports", "/reports/appointment-sales", {
    menuGroup: "Financial reports",
    legacyAny: ["pharmacy.view", "pharmacy.pos", "accounts.view", "accounts.reports", "appointments.view"],
  }),
  p("pages.reports.lab_sales", "Lab sales report", "reports", "/finance/lab-sales-report", {
    menuGroup: "Financial reports",
    legacyAny: ["financial.view", "accounts.reports", "lab.view"],
  }),
  p("pages.reports.lab_consume", "Lab consume report", "reports", "/reports/lab-consume", {
    menuGroup: "Financial reports",
    legacyAny: ["financial.view", "accounts.reports", "lab.view"],
  }),
  p("pages.reports.service_consume_financial", "Service consume report", "reports", "/reports/service-consume", {
    menuGroup: "Financial reports",
    legacyAny: ["financial.view", "accounts.reports", "appointments.view"],
  }),
  p("pages.reports.sales", "Sales report", "reports", "/reports/sales", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.purchases", "Purchase report", "reports", "/reports/purchases", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.inventory", "Inventory report", "reports", "/reports/inventory", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.categories", "Categories report", "reports", "/reports/categories", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.suppliers", "Suppliers report", "reports", "/reports/suppliers", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.opening_inventory", "Opening inventory report", "reports", "/reports/opening-inventory", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["pharmacy.view"],
  }),
  p("pages.reports.lab_activity", "Lab activity", "reports", "/reports/lab-activity", {
    menuGroup: "Pharmacy & stock",
    legacyAny: ["lab.view"],
  }),
  p("pages.reports.new_members", "Client registration report", "reports", "/reports/new-members", {
    menuGroup: "Clients & visits",
    legacyAny: ["patients.view"],
  }),
  p("pages.reports.outstanding_balances", "Outstanding balances", "reports", "/reports/outstanding-balances", {
    menuGroup: "Clients & visits",
    legacyAny: ["accounts.deposit", "pharmacy.pos", "patients.view"],
  }),
  p("pages.reports.calendar_visits", "Calendar visits & services", "reports", "/reports/calendar-visits", {
    menuGroup: "Clients & visits",
    legacyAny: ["appointments.view"],
  }),
  p("pages.reports.appointment_status", "Appointment status", "reports", "/reports/appointment-status", {
    menuGroup: "Clients & visits",
    legacyAny: ["appointments.view"],
  }),
  p("pages.reports.service_consume", "Service consume report", "reports", "/reports/service-consume", {
    menuGroup: "Clients & visits",
    legacyAny: ["appointments.view"],
  }),
  p("pages.reports.form_submissions", "Form responses", "reports", "/reports/form-submissions", {
    menuGroup: "Clients & visits",
    legacyAny: ["forms.view"],
  }),
  p("pages.reports.activity_log", "Activity log", "reports", "/reports/activity-log", {
    legacyAny: ["audit.view", "audit.view_admins"],
  }),
  p("pages.reports.outreach", "Field outreach", "reports", "/reports/outreach", {
    legacyAny: ["pharmacy.view"],
  }),

  p("pages.services.list", "All services", "clinic_setup", "/settings/services", {
    menuGroup: "Services",
    legacyAny: ["appointments.view"],
  }),
  p("pages.services.new", "New service", "clinic_setup", "/settings/services/new", {
    menuGroup: "Services",
    legacyAny: ["appointments.view"],
  }),
  p("pages.forms.list", "All forms", "clinic_setup", "/forms", {
    menuGroup: "Custom forms",
    legacyAny: ["forms.view"],
  }),
  p("pages.forms.new", "New form", "clinic_setup", "/forms/new", {
    menuGroup: "Custom forms",
    legacyAny: ["forms.create"],
  }),

  p("pages.hr.staff", "Staff list", "hr", "/hr/staff", {
    menuGroup: "Human Resources",
    legacyAny: ["hr.view"],
  }),
  p("pages.hr.work_schedule", "Work schedule report", "hr", "/reports/work-schedule", {
    menuGroup: "Human Resources",
    legacyAny: ["hr.view"],
  }),
  p("pages.hr.staff_new", "Register staff", "hr", "/hr/staff/new", {
    menuGroup: "Human Resources",
    legacyAny: ["hr.create"],
  }),

  p("pages.settings.overview", "Settings overview", "system", "/settings", {
    menuGroup: "Settings",
    legacyAny: ["settings.view"],
  }),
  p("pages.settings.branches", "Branches & access", "system", "/settings/branches", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage"],
  }),
  p("pages.settings.referral_sources", "Referred from", "system", "/settings/referral-sources", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage"],
  }),
  p("pages.settings.cities_villages", "Cities & villages", "system", "/settings/cities-villages", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage"],
  }),
  p("pages.settings.doctors", "Doctors", "system", "/settings/doctors", {
    menuGroup: "Settings",
    legacyAny: ["appointments.view"],
  }),
  p("pages.settings.appointment_calendar", "Calendar settings", "system", "/settings/appointment-calendar", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage", "appointments.view"],
  }),
  p("pages.settings.appointment_blocks", "Holidays & blocked times", "system", "/settings/appointment-blocks", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage"],
  }),
  p("pages.settings.active_users", "Active users", "system", "/settings/active-users", {
    menuGroup: "Settings",
    legacyAny: ["audit.view", "audit.view_admins"],
  }),
  p("pages.settings.activity", "Activity log (settings)", "system", "/settings/activity", {
    menuGroup: "Settings",
    legacyAny: ["audit.view"],
  }),
  p("pages.settings.trash", "Recycle bin", "system", "/settings/trash", {
    menuGroup: "Settings",
    legacyAny: ["settings.manage"],
  }),
  p("pages.settings.admin_activity", "Admin activity", "system", "/settings/admin-activity", {
    menuGroup: "Settings",
    legacyAny: ["audit.view", "audit.view_admins"],
  }),

  p("pages.users", "Users", "access_control", "/users", { legacyAny: ["users.view"] }),
  p("pages.roles", "Roles", "access_control", "/roles", { legacyAny: ["roles.view"] }),
  p("pages.permissions", "Permissions", "access_control", "/permissions", {
    legacyAny: ["permissions.view"],
  }),
];

/** Lookup map: permission key → definition */
export const PAGE_PERMISSION_BY_KEY = new Map(
  PAGE_PERMISSIONS.map((def) => [def.permission, def])
);

/** Short aliases for sidebar / nav configs */
export const PP = Object.fromEntries(
  PAGE_PERMISSIONS.map((def) => {
    const alias = def.permission.replace(/^pages\./, "").replace(/\./g, "_");
    return [alias, def.permission];
  })
) as Record<string, string>;

export function isPagePermission(name: string): boolean {
  return name.startsWith("pages.");
}

/** Seed entries derived from registry */
export function pagePermissionsForSeed(): {
  name: string;
  description: string;
  module: string;
}[] {
  return PAGE_PERMISSIONS.map((def) => ({
    name: def.permission,
    description: `Access page: ${def.label}`,
    module: def.section,
  }));
}

const SECTION_ORDER: PageSectionKey[] = [
  "overview",
  "scheduling",
  "clinical",
  "pharmacy_clients",
  "finance",
  "reports",
  "clinic_setup",
  "hr",
  "system",
  "access_control",
];

/** Group page definitions by sidebar section (for Roles UI). */
export function groupPagesBySection(): { section: PageSectionKey; title: string; pages: PagePermissionDef[] }[] {
  return SECTION_ORDER.map((section) => ({
    section,
    title: PAGE_SECTION_TITLES[section],
    pages: PAGE_PERMISSIONS.filter((def) => def.section === section),
  })).filter((g) => g.pages.length > 0);
}

/** True if the user holds the permission directly or via a granted page that implies it. */
export function permissionGranted(userPermissions: readonly string[], required: string): boolean {
  if (userPermissions.includes(required)) return true;

  // Granted page → implied legacy permission (e.g. pages.pharmacy.inventory → pharmacy.view)
  for (const held of userPermissions) {
    if (!isPagePermission(held)) continue;
    const def = PAGE_PERMISSION_BY_KEY.get(held);
    if (def?.legacyAny?.includes(required)) return true;
  }

  // Legacy permission → implied page access until roles are migrated to page keys
  if (isPagePermission(required)) {
    const def = PAGE_PERMISSION_BY_KEY.get(required);
    if (def?.legacyAny?.some((l) => userPermissions.includes(l))) return true;
  }

  return false;
}

/** True if the user holds at least one of the required permissions (direct or via pages). */
export function permissionAnyGranted(userPermissions: readonly string[], required: string[]): boolean {
  return required.some((r) => permissionGranted(userPermissions, r));
}

/** Find page permission key for a path (exact or prefix). */
export function pagePermissionForPath(pathname: string): string | null {
  const base = pathname.split("?")[0] ?? pathname;
  let best: PagePermissionDef | null = null;
  for (const def of PAGE_PERMISSIONS) {
    if (base === def.path || (def.path !== "/" && base.startsWith(`${def.path}/`))) {
      if (!best || def.path.length > best.path.length) best = def;
    }
  }
  return best?.permission ?? null;
}
