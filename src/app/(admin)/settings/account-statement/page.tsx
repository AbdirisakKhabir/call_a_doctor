"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Row = {
  id: number;
  accountId: number;
  accountName: string;
  kind: string;
  amount: number;
  description: string | null;
  transactionDate: string;
  saleId: number | null;
  paymentMethod: { name: string } | null;
  createdBy: { name: string | null } | null;
  balanceAfter: number;
};

export default function AccountStatementPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("accounts.reports");

  const [transactions, setTransactions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountOptions, setAccountOptions] = useState<{ id: number; name: string }[]>([]);

  const loadStatement = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (accountId) params.set("accountId", accountId);
      const res = await authFetch(`/api/finance/account-statement?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoading(false);
    }
  }, [from, to, accountId]);

  useEffect(() => {
    if (!canView) return;
    (async () => {
      const res = await authFetch("/api/finance/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccountOptions(data.map((a: { id: number; name: string }) => ({ id: a.id, name: a.name })));
      }
    })();
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    loadStatement();
  }, [canView, loadStatement]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Account statement" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500">You do not have permission to view account reports.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Account statement" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          One ledger table: filter by start date, end date, and optionally a single account. Balance is the running total for that row&apos;s account.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 sm:flex-row sm:flex-wrap sm:items-end">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          fromLabel="Start date"
          toLabel="End date"
          onClear={() => {
            setFrom("");
            setTo("");
          }}
        />
        <div>
          <Label>Account</Label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 h-10 w-full min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white sm:w-auto"
          >
            <option value="">All accounts</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadStatement()} className="sm:mb-0.5">
          Apply filters
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-800/50">
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Date</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="min-w-[120px] px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Sale</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      No transactions match your filters.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700 dark:text-gray-300">
                        {new Date(t.transactionDate).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900 dark:text-white">
                        {t.accountName}
                      </td>
                      <td className="px-4 py-2.5 capitalize">{t.kind}</td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                        {t.description || t.paymentMethod?.name || "—"}
                      </td>
                      <td className="px-4 py-2.5">{t.saleId ? `#${t.saleId}` : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {t.kind === "withdrawal" ? "−" : "+"}${t.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900 dark:text-white">
                        ${t.balanceAfter.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
