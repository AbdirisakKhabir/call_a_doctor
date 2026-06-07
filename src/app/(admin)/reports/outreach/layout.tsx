import { OutreachReportsProvider } from "@/components/reports/outreach/OutreachReportsProvider";
import { OutreachReportFilters } from "@/components/reports/outreach/OutreachReportFilters";

export default function OutreachReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OutreachReportsProvider>
      <OutreachReportFilters />
      <div className="pb-12">{children}</div>
    </OutreachReportsProvider>
  );
}
