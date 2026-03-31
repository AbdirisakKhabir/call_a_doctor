"use client";

import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useOutreachReport } from "@/components/reports/outreach/OutreachReportsProvider";
import { useAuth } from "@/context/AuthContext";

export default function OutreachIssuanceReportPage() {
  const { hasPermission } = useAuth();
  const { data, loading } = useOutreachReport();
  const rows = data?.salesFromPharmacy ?? [];
  const total = rows.reduce((s, r) => s + r.totalAmount, 0);

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Issuance to teams" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Issuance to teams" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Pharmacy POS sales where stock is issued to an outreach team (bag inventory). Includes credit (AR) and
        paid-at-counter transfers for the selected period.
      </p>

      {loading && !data ? (
        <div className="mt-10 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3">
          <div className="border-b border-gray-100 bg-gray-50/90 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Total issuance: <span className="font-mono tabular-nums">${total.toFixed(2)}</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/50">
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Sale #</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Date &amp; time</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Team</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-100 odd:bg-gray-50/50 dark:border-gray-800 dark:odd:bg-gray-900/20"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{s.id}</td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                      {new Date(s.saleDate).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {s.outreachTeam?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-gray-900 dark:text-white">
                      ${s.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No issuance transactions this period.</p>
          )}
        </div>
      )}
    </div>
  );
}
