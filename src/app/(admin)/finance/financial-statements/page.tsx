"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type LedgerRow = {
  id: number;
  name: string;
  code: string | null;
  type: string;
  openingBalance: number;
  depositsInPeriod: number;
  withdrawalsInPeriod: number;
  closingBalance: number;
};

type ReportData = {
  ledgerAccounts: LedgerRow[];
  totals: { closingBalancesAllAccounts: number };
  dateRange: { from: string | null; to: string | null };
};

function dateRangeLabel(from: string | null, to: string | null) {
  if (from && to) {
    return `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`;
  }
  if (from) return `From ${new Date(from).toLocaleDateString()}`;
  if (to) return `Until ${new Date(to).toLocaleDateString()}`;
  return "All dates (cumulative)";
}

export default function AccountStatementPage() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const canView =
    hasPermission("financial.view") || hasPermission("accounts.reports");

  async function loadReport() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await authFetch(`/api/finance/financial-statements?${params}`);
    if (res.ok) setData(await res.json());
    else setData(null);
    setLoading(false);
  }

  useEffect(() => {
    loadReport();
  }, [from, to]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Account statement" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to view the account statement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Account statement" />
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/financial-reports"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Financial reports overview
          </Link>
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
      </div>

      <p className="mb-6 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Opening balance (start of range), deposits and withdrawals in range, and closing balance for each active ledger
        account. For posted transactions line by line, use{" "}
        <Link
          href="/settings/account-statement"
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Settings → Account statement
        </Link>
        .
      </p>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load account statement.</p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ledger balances</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Opening (start of range), deposits and withdrawals in range, closing balance.{" "}
              {dateRangeLabel(data.dateRange.from, data.dateRange.to)}
            </p>
          </div>
          {data.ledgerAccounts.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No active ledger accounts.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                    <th className="px-6 py-3">Account</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3 text-right">Opening</th>
                    <th className="px-6 py-3 text-right">Deposits</th>
                    <th className="px-6 py-3 text-right">Withdrawals</th>
                    <th className="px-6 py-3 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.ledgerAccounts.map((row) => (
                    <tr key={row.id}>
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{row.name}</span>
                        {row.code ? (
                          <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{row.code}</span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3 text-sm capitalize text-gray-600 dark:text-gray-400">{row.type}</td>
                      <td className="px-6 py-3 text-right font-mono text-sm tabular-nums text-gray-800 dark:text-gray-200">
                        ${row.openingBalance.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm tabular-nums text-gray-800 dark:text-gray-200">
                        ${row.depositsInPeriod.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm tabular-nums text-gray-800 dark:text-gray-200">
                        ${row.withdrawalsInPeriod.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        ${row.closingBalance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white" colSpan={5}>
                      Total closing (all accounts)
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-gray-900 dark:text-white">
                      ${data.totals.closingBalancesAllAccounts.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
