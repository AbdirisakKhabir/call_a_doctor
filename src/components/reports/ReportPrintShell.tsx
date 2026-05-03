"use client";

import React, { useMemo, useState } from "react";
import {
  CLINIC_CALL_CENTER,
  CLINIC_CONTACT_NUMBERS,
  CLINIC_MERCHANT_NUMBERS,
  RECEIPT_LOGO_PUBLIC_PATH,
  RECEIPT_BRAND,
  RECEIPT_BRAND_TINT,
} from "@/lib/receipt-print-theme";
import { useBranchScope } from "@/hooks/useBranchScope";

type MetaLine = { label: string; value: string };

type Props = {
  documentTitle: string;
  subtitle?: string;
  metaLines?: MetaLine[];
  branchLine?: string;
  children: React.ReactNode;
};

export function ReportPrintShell({
  documentTitle,
  subtitle,
  metaLines = [],
  branchLine: branchLineProp,
  children,
}: Props) {
  const { allBranchesLabel, seesAllBranches, singleAssignedBranchId } = useBranchScope();

  const branchLine =
    branchLineProp?.trim() ||
    (seesAllBranches
      ? "All locations"
      : singleAssignedBranchId != null
        ? `Branch #${singleAssignedBranchId}`
        : allBranchesLabel);

  const payLine1 = useMemo(
    () => CLINIC_MERCHANT_NUMBERS.map((m) => `${m.label}: ${m.number}`).join(" | "),
    []
  );
  const payLine2 = useMemo(
    () => CLINIC_CONTACT_NUMBERS.map((c) => `${c.label}: ${c.number}`).join(" | "),
    []
  );

  const [printedAt] = useState(() => new Date().toLocaleString());

  const combinedMeta: MetaLine[] = useMemo(
    () => [{ label: "Printed", value: printedAt }, ...metaLines],
    [printedAt, metaLines]
  );

  return (
    <div className="report-print-root">
      <div className="no-print mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-[#2b5532] bg-[#e3f5e7] px-4 py-2 text-sm font-semibold text-[#2b5532] hover:bg-[#d4eeda]"
        >
          Print report
        </button>
      </div>

      <header className="report-print-masthead mb-6 print:mb-4">
        <div
          className="mb-4 grid grid-cols-1 gap-4 border-b-2 pb-4 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]"
          style={{ borderColor: RECEIPT_BRAND }}
        >
          <div className="min-w-0">
            <p className="mb-1 text-[12pt] font-bold" style={{ color: RECEIPT_BRAND }}>
              Call a Doctor
            </p>
            <p className="text-[8.5pt] leading-snug text-gray-700 dark:text-gray-300">{branchLine}</p>
            <p className="mt-0.5 text-[8.5pt] leading-snug text-gray-700 dark:text-gray-300">
              Call center: {CLINIC_CALL_CENTER}
            </p>
            <p className="mt-1 break-words text-[7.5pt] leading-snug text-gray-600 dark:text-gray-400">
              {payLine1}
            </p>
            <p className="break-words text-[7.5pt] leading-snug text-gray-600 dark:text-gray-400">{payLine2}</p>
          </div>
          <div className="report-print-logo flex shrink-0 items-center justify-center sm:justify-end print:justify-end">
            {/* eslint-disable-next-line @next/next/no-img-element -- reliable in print preview */}
            <img
              src={RECEIPT_LOGO_PUBLIC_PATH}
              alt=""
              className="h-24 w-auto max-h-24 max-w-[120px] object-contain"
            />
          </div>
        </div>

        <div
          className="flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-start sm:justify-between print:flex-row print:justify-between"
          style={{
            backgroundColor: RECEIPT_BRAND_TINT,
            borderTop: `2px solid ${RECEIPT_BRAND}`,
          }}
        >
          <div className="min-w-0">
            <h1
              className="text-balance text-[16pt] font-bold uppercase tracking-wide print:text-[14pt]"
              style={{ color: RECEIPT_BRAND }}
            >
              {documentTitle}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400 print:text-gray-800">
                {subtitle}
              </p>
            ) : null}
          </div>
          {combinedMeta.length > 0 ? (
            <div className="shrink-0 text-left text-sm text-gray-800 sm:text-right dark:text-gray-200 print:text-right">
              {combinedMeta.map((row) => (
                <div key={row.label} className="mb-1 last:mb-0">
                  <span className="font-semibold" style={{ color: RECEIPT_BRAND }}>
                    {row.label}:
                  </span>{" "}
                  <span className="tabular-nums text-gray-900 dark:text-white">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="report-print-body">{children}</div>
    </div>
  );
}
