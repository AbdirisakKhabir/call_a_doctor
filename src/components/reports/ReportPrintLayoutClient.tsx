"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { getReportPrintTitle } from "@/lib/report-print-titles";
import { ReportPrintShell } from "./ReportPrintShell";

export function ReportPrintLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const documentTitle = getReportPrintTitle(pathname ?? "");

  return <ReportPrintShell documentTitle={documentTitle}>{children}</ReportPrintShell>;
}
