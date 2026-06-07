"use client";

import React from "react";
import type { IncomeStatementResult } from "@/lib/financial-income-statement";

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  data: IncomeStatementResult;
  /** Shown under the main title (e.g. date range). */
  periodHint?: string;
  /** Accessible title; default "Income statement". */
  title?: string;
  /** When false, hide the methodology note under the table. Default true. */
  showFootnote?: boolean;
};

export function IncomeStatementTable({
  data,
  periodHint,
  title = "Income statement",
  showFootnote = true,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="border-b border-gray-200 bg-gray-50/80 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
        <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Condensed statement of operations (management view).</p>
        {periodHint ? (
          <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{periodHint}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-800/60">
              <th scope="col" className="px-6 py-3 font-semibold text-gray-900 dark:text-white">
                Description
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right font-semibold text-gray-900 tabular-nums dark:text-white"
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            <tr className="bg-gray-100/90 dark:bg-gray-800/50">
              <td
                colSpan={2}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400"
              >
                Revenue
              </td>
            </tr>
            {data.revenue.lines.map((line) => {
              const signed = line.isDeduction ? -line.amount : line.amount;
              const showParens = line.isDeduction && line.amount > 0;
              return (
                <tr key={line.id} className="hover:bg-gray-50/80 dark:hover:bg-white/5">
                  <td className="px-6 py-2.5 pl-10 text-gray-700 dark:text-gray-300">
                    {line.isDeduction ? (
                      <span className="text-gray-600 dark:text-gray-400">Less: {line.label}</span>
                    ) : (
                      line.label
                    )}
                  </td>
                  <td
                    className={`px-6 py-2.5 text-right tabular-nums font-medium ${
                      showParens
                        ? "text-error-600 dark:text-error-400"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {showParens ? `(${formatMoney(line.amount)})` : formatMoney(signed)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-gray-200 bg-gray-50/60 dark:border-gray-600 dark:bg-gray-800/30">
              <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white">Total revenue</td>
              <td className="px-6 py-3 text-right text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                {formatMoney(data.revenue.total)}
              </td>
            </tr>
            <tr className="bg-gray-100/90 dark:bg-gray-800/50">
              <td
                colSpan={2}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-400"
              >
                Expenses
              </td>
            </tr>
            {data.expenses.lines.map((line) => (
              <tr key={line.id} className="hover:bg-gray-50/80 dark:hover:bg-white/5">
                <td className="px-6 py-2.5 pl-10 text-gray-700 dark:text-gray-300">{line.label}</td>
                <td className="px-6 py-2.5 text-right tabular-nums font-medium text-gray-900 dark:text-white">
                  {formatMoney(line.amount)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50/60 dark:border-gray-600 dark:bg-gray-800/30">
              <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white">Total expenses</td>
              <td className="px-6 py-3 text-right text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                {formatMoney(data.expenses.total)}
              </td>
            </tr>
            <tr className="border-t-2 border-gray-900 dark:border-white/80">
              <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">Net income</td>
              <td
                className={`px-6 py-4 text-right text-base font-bold tabular-nums ${
                  data.netIncome >= 0
                    ? "text-success-700 dark:text-success-400"
                    : "text-error-600 dark:text-error-400"
                }`}
              >
                {formatMoney(data.netIncome)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {showFootnote ? (
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Revenue includes posted POS and visit-billing sales and lab register totals. Visit billing uses completed sale
          records, not appointment estimates. Pharmacy returns reduce revenue in the period processed.
        </p>
      ) : null}
    </div>
  );
}
