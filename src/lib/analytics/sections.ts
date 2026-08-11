/** Analytics sections: one complete report each. Shared by the sidebar, hub page, and API. */

import { PP } from "@/lib/page-permissions";

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
  /** Page permission key */
  permission: string;
};

export const ANALYTICS_SECTIONS: AnalyticsSectionMeta[] = [
  {
    key: "revenue",
    name: "Revenue & finance",
    path: "/analytics/revenue",
    title: "Revenue & finance analytics",
    description:
      "Income by source, daily revenue trend, payment method mix, operating expenses, and net position.",
    permission: PP.analytics_revenue,
  },
  {
    key: "appointments",
    name: "Appointments",
    path: "/analytics/appointments",
    title: "Appointment analytics",
    description:
      "Booking volume, status outcomes, no-show and cancellation rates, busiest weekdays and hours, and top services.",
    permission: PP.analytics_appointments,
  },
  {
    key: "clients",
    name: "Clients",
    path: "/analytics/clients",
    title: "Client analytics",
    description:
      "New registrations over time, gender and age profile, referral sources, locality spread, and returning-client rate.",
    permission: PP.analytics_clients,
  },
  {
    key: "pharmacy",
    name: "Pharmacy & stock",
    path: "/analytics/pharmacy",
    title: "Pharmacy analytics",
    description:
      "Point-of-sale revenue and margin, best-selling products, category mix, basket size, and stock risk.",
    permission: PP.analytics_pharmacy,
  },
  {
    key: "lab",
    name: "Laboratory",
    path: "/analytics/lab",
    title: "Laboratory analytics",
    description:
      "Order volume and completion, most requested tests, lab fee revenue and collection rate, and result turnaround.",
    permission: PP.analytics_lab,
  },
  {
    key: "doctors",
    name: "Doctor performance",
    path: "/analytics/doctors",
    title: "Doctor performance analytics",
    description:
      "Bookings and revenue per doctor, completion and no-show rates, clients seen, and clinical ordering activity.",
    permission: PP.analytics_doctors,
  },
];

export const ANALYTICS_OVERVIEW_PERMISSION = PP.analytics_overview;

export const ANALYTICS_PARENT_PERMISSION_ANY: string[] = [
  ANALYTICS_OVERVIEW_PERMISSION,
  ...ANALYTICS_SECTIONS.map((s) => s.permission),
];

export function getAnalyticsSection(key: string): AnalyticsSectionMeta | null {
  return ANALYTICS_SECTIONS.find((s) => s.key === key) ?? null;
}
