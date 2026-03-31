import { redirect } from "next/navigation";

/** @deprecated Use /reports/outreach — outreach reports moved to a dedicated section. */
export default function LegacyOutreachInventoryRedirect() {
  redirect("/reports/outreach");
}
