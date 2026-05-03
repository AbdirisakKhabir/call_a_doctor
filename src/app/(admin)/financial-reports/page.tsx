"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FINANCIAL_REPORTS_NAV, hubEntryVisible } from "@/lib/financial-hub-nav";
import type { IncomeStatementResult } from "@/lib/financial-income-statement";
import { IncomeStatementTable } from "@/components/finance/IncomeStatementTable";

type ReportData = {
  incomeStatement: IncomeStatementResult;
  dateRange: { from: string | null; to: string | null };
};

export default function FinancialReportsPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const canAccessPage = FINANCIAL_REPORTS_NAV.some((e) => hubEntryVisible(hasPermission, e));
  const canViewIncome = hasPermission("financial.view") || hasPermission("accounts.reports");

  useEffect(() => {
    if (!canViewIncome) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await authFetch(`/api/financial-reports?${params}`);
      if (cancelled) return;
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, canViewIncome]);

  if (!canAccessPage) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Financial reports" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Financial reports" />
        {canViewIncome ? (
          <DateRangeFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onClear={() => {
              setFrom("");
              setTo("");
            }}
          />
        ) : null}
      </div>

      <div className="no-print mb-8">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Report directory</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Same items as <strong className="font-medium text-gray-700 dark:text-gray-300">Reports → Financial reports</strong> in
          the sidebar. Each opens in a new context with its own date range.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FINANCIAL_REPORTS_NAV.filter((e) => hubEntryVisible(hasPermission, e)).map((e) => (
            <li key={e.path}>
              <Link
                href={e.path}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:border-brand-300 hover:shadow-sm dark:border-gray-800 dark:bg-white/3 dark:hover:border-brand-600"
              >
                <span className="font-medium text-gray-900 dark:text-white">{e.name}</span>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{e.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        {canViewIncome ? (
          loading ? (
            <div className="flex justify-center rounded-2xl border border-gray-200 bg-white py-16 dark:border-gray-800 dark:bg-white/3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
            </div>
          ) : data ? (
            <IncomeStatementTable
              data={data.incomeStatement}
              periodHint={
                data.dateRange.from || data.dateRange.to
                  ? data.dateRange.from && data.dateRange.to
                    ? `${new Date(data.dateRange.from).toLocaleDateString()} – ${new Date(data.dateRange.to).toLocaleDateString()}`
                    : data.dateRange.from
                      ? `From ${new Date(data.dateRange.from).toLocaleDateString()}`
                      : data.dateRange.to
                        ? `Until ${new Date(data.dateRange.to).toLocaleDateString()}`
                        : "All dates"
                  : "All dates · cumulative"
              }
            />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 dark:border-gray-800 dark:bg-white/3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load report.</p>
            </div>
          )
        ) : null}
      </div>
    </>
  );
}
