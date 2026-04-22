"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type IncomeStatement = {
  revenue: { pharmacy: number; appointments: number; total: number };
  expenses: { purchases: number; operating: number; total: number };
  netIncome: number;
};

type ReportData = {
  incomeStatement: IncomeStatement;
  dateRange: { from: string | null; to: string | null };
};

export default function FinancialReportsPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const canView = hasPermission("financial.view");

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await authFetch(`/api/financial-reports?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadReport();
  }, [from, to]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Financial Reports" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Financial Reports" />
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
      </div>

      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h3 className="text-lg font-semibold">Income Statement</h3>
            {data?.dateRange && (data.dateRange.from || data.dateRange.to) && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {data.dateRange.from && data.dateRange.to
                  ? `${new Date(data.dateRange.from).toLocaleDateString()} – ${new Date(data.dateRange.to).toLocaleDateString()}`
                  : data.dateRange.from
                    ? `From ${new Date(data.dateRange.from).toLocaleDateString()}`
                    : data.dateRange.to
                      ? `Until ${new Date(data.dateRange.to).toLocaleDateString()}`
                      : "All time"}
              </p>
            )}
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
            </div>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">Revenue</td>
                    <td className="px-6 py-3 text-right"></td>
                  </tr>
                  <tr>
                    <td className="pl-10 pr-6 py-2 text-sm text-gray-600 dark:text-gray-400">Pharmacy sales</td>
                    <td className="px-6 py-2 text-right font-medium text-gray-900 dark:text-white">${data.incomeStatement.revenue.pharmacy.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="pl-10 pr-6 py-2 text-sm text-gray-600 dark:text-gray-400">Calendar</td>
                    <td className="px-6 py-2 text-right font-medium text-gray-900 dark:text-white">${data.incomeStatement.revenue.appointments.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">Total Revenue</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">${data.incomeStatement.revenue.total.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">Expenses</td>
                    <td className="px-6 py-3 text-right"></td>
                  </tr>
                  <tr>
                    <td className="pl-10 pr-6 py-2 text-sm text-gray-600 dark:text-gray-400">Pharmacy purchases</td>
                    <td className="px-6 py-2 text-right font-medium text-gray-900 dark:text-white">${data.incomeStatement.expenses.purchases.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="pl-10 pr-6 py-2 text-sm text-gray-600 dark:text-gray-400">Operating expenses</td>
                    <td className="px-6 py-2 text-right font-medium text-gray-900 dark:text-white">${data.incomeStatement.expenses.operating.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white">Total Expenses</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">${data.incomeStatement.expenses.total.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-gray-50 dark:bg-gray-800/50">
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">Net Income</td>
                    <td className={`px-6 py-4 text-right font-bold ${data.incomeStatement.netIncome >= 0 ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}>
                      ${data.incomeStatement.netIncome.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load report.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
