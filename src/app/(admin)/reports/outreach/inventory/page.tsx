"use client";

import React from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useOutreachReport } from "@/components/reports/outreach/OutreachReportsProvider";
import { useAuth } from "@/context/AuthContext";

export default function OutreachInventoryReportPage() {
  const { hasPermission } = useAuth();
  const { data, loading } = useOutreachReport();
  const teams = data?.teamInventorySnapshot ?? [];
  const totalAr = teams.reduce((s, t) => s + t.creditBalance, 0);

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Inventory & AR" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Inventory & AR" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Current bag inventory by team (on-hand quantities) and outstanding accounts receivable owed to the
        pharmacy. Snapshot reflects live data (not limited to the selected date range for stock on hand).
      </p>

      {loading && !data ? (
        <div className="mt-10 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100/90">
            Combined team AR:{" "}
            <span className="font-mono font-semibold tabular-nums">${totalAr.toFixed(2)}</span>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {teams.map((t) => (
              <div
                key={t.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3"
              >
                <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-5 py-4 dark:border-gray-800 dark:from-gray-900/60 dark:to-transparent">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t.name}</h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t.isActive ? "Active team" : "Inactive"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Credit (AR)
                      </p>
                      <p className="font-mono text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                        ${t.creditBalance.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto px-5 py-4 custom-scrollbar">
                  {t.inventory.length === 0 ? (
                    <p className="text-sm text-gray-500">No stock in bag.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <th className="pb-2 pr-2">Product</th>
                          <th className="pb-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.inventory.map((row) => (
                          <tr
                            key={`${t.id}-${row.productId}`}
                            className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                          >
                            <td className="py-2 pr-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {row.product.name}
                              </span>
                              <span className="ml-2 text-xs text-gray-500">{row.product.code}</span>
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-200">
                              {row.quantity} {row.product.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>
          {teams.length === 0 && (
            <p className="mt-8 text-center text-sm text-gray-500">No outreach teams for this branch.</p>
          )}
        </>
      )}
    </div>
  );
}
