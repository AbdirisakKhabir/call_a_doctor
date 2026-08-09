import { userHasPermission } from "@/lib/permissions";
import type { AnalyticsScope } from "@/lib/analytics/scope";
import type { AnalyticsReport } from "@/lib/analytics/types";
import type { AnalyticsSectionKey, AnalyticsSectionMeta } from "@/lib/analytics/sections";
import { buildAppointmentsReport } from "@/lib/analytics/sections/appointments";
import { buildClientsReport } from "@/lib/analytics/sections/clients";
import { buildDoctorsReport } from "@/lib/analytics/sections/doctors";
import { buildLabReport } from "@/lib/analytics/sections/lab";
import { buildPharmacyReport } from "@/lib/analytics/sections/pharmacy";
import { buildRevenueReport } from "@/lib/analytics/sections/revenue";

export type AnalyticsReportBuilder = (scope: AnalyticsScope) => Promise<AnalyticsReport>;

export const ANALYTICS_BUILDERS: Record<AnalyticsSectionKey, AnalyticsReportBuilder> = {
  revenue: buildRevenueReport,
  appointments: buildAppointmentsReport,
  clients: buildClientsReport,
  pharmacy: buildPharmacyReport,
  lab: buildLabReport,
  doctors: buildDoctorsReport,
};

export async function userCanViewSection(userId: number, section: AnalyticsSectionMeta): Promise<boolean> {
  const results = await Promise.all(section.permissionAny.map((p) => userHasPermission(userId, p)));
  return results.some(Boolean);
}
