/** Analytics sections: one complete report each. Shared by the sidebar, hub page, and API. */

export const ANALYTICS_VIEW_PERMISSION = "analytics.view";

export type AnalyticsSectionKey =
  | "revenue"
  | "appointments"
  | "clients"
  | "pharmacy"
  | "lab"
  | "doctors";

export type AnalyticsSectionMeta = {
  key: AnalyticsSectionKey;
  /** Short label for nav. */
  name: string;
  path: string;
  /** Page heading. */
  title: string;
  description: string;
  /** User needs at least one of these. */
  permissionAny: string[];
};

function withAnalyticsPermission(perms: string[]): string[] {
  return [ANALYTICS_VIEW_PERMISSION, ...perms];
}

export const ANALYTICS_SECTIONS: AnalyticsSectionMeta[] = [
  {
    key: "revenue",
    name: "Revenue & finance",
    path: "/analytics/revenue",
    title: "Revenue & finance analytics",
    description:
      "Income by source, daily revenue trend, payment method mix, operating expenses, and net position.",
    permissionAny: withAnalyticsPermission(["financial.view", "accounts.reports"]),
  },
  {
    key: "appointments",
    name: "Appointments",
    path: "/analytics/appointments",
    title: "Appointment analytics",
    description:
      "Booking volume, status outcomes, no-show and cancellation rates, busiest weekdays and hours, and top services.",
    permissionAny: withAnalyticsPermission(["appointments.view"]),
  },
  {
    key: "clients",
    name: "Clients",
    path: "/analytics/clients",
    title: "Client analytics",
    description:
      "New registrations over time, gender and age profile, referral sources, locality spread, and returning-client rate.",
    permissionAny: withAnalyticsPermission(["patients.view"]),
  },
  {
    key: "pharmacy",
    name: "Pharmacy & stock",
    path: "/analytics/pharmacy",
    title: "Pharmacy analytics",
    description:
      "Point-of-sale revenue and margin, best-selling products, category mix, basket size, and stock risk.",
    permissionAny: withAnalyticsPermission(["pharmacy.view", "pharmacy.pos"]),
  },
  {
    key: "lab",
    name: "Laboratory",
    path: "/analytics/lab",
    title: "Laboratory analytics",
    description:
      "Order volume and completion, most requested tests, lab fee revenue and collection rate, and result turnaround.",
    permissionAny: withAnalyticsPermission(["lab.view"]),
  },
  {
    key: "doctors",
    name: "Doctor performance",
    path: "/analytics/doctors",
    title: "Doctor performance analytics",
    description:
      "Bookings and revenue per doctor, completion and no-show rates, clients seen, and clinical ordering activity.",
    permissionAny: withAnalyticsPermission(["appointments.view"]),
  },
];

export const ANALYTICS_PARENT_PERMISSION_ANY: string[] = [
  ...new Set(ANALYTICS_SECTIONS.flatMap((s) => s.permissionAny)),
];

export function getAnalyticsSection(key: string): AnalyticsSectionMeta | null {
  return ANALYTICS_SECTIONS.find((s) => s.key === key) ?? null;
}
