import React from "react";
import { ReportPrintLayoutClient } from "@/components/reports/ReportPrintLayoutClient";

export default function FinancialReportsLayout({ children }: { children: React.ReactNode }) {
  return <ReportPrintLayoutClient>{children}</ReportPrintLayoutClient>;
}
