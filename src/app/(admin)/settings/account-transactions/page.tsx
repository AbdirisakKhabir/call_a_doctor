"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Tx = {
  id: number;
  kind: string;
  amount: number;
  description: string | null;
  transactionDate: string;
  account: { id: number; name: string };
  paymentMethod: { id: number; name: string } | null;
  sale: { id: number; totalAmount: number } | null;
  createdBy: { name: string | null } | null;
};

type SaleOpt = {
  id: number;
  totalAmount: number;
  saleDate: string;
  branch: { name: string } | null;
};

type PM = { id: number; name: string; account: { name: string } };
type Acc = { id: number; name: string; balance: number };

export default function AccountTransactionsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("accounts.view");
  const canDeposit = hasPermission("accounts.deposit");
  const canWithdraw = hasPermission("accounts.withdraw");

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const txPageSize = 20;
  const [sales, setSales] = useState<SaleOpt[]>([]);
  const [methods, setMethods] = useState<PM[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [filters, setFilters] = useState({ from: "", to: "", accountId: "" });

  const [depForm, setDepForm] = useState({
    paymentMethodId: "",
    saleId: "",
    amount: "",
    description: "",
    transactionDate: new Date().toISOString().slice(0, 10),
  });
  const [wdForm, setWdForm] = useState({
    accountId: "",
    amount: "",
    description: "",
    transactionDate: new Date().toISOString().slice(0, 10),
  });
  const [depSubmit, setDepSubmit] = useState(false);
  const [wdSubmit, setWdSubmit] = useState(false);
  const [msg, setMsg] = useState("");

  const loadTx = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.accountId) params.set("accountId", filters.accountId);
    params.set("page", String(txPage));
    params.set("pageSize", String(txPageSize));
    const res = await authFetch(`/api/finance/transactions?${params}`);
    if (res.ok) {
      const body = await res.json();
      setTransactions(body.data ?? []);
      setTxTotal(typeof body.total === "number" ? body.total : 0);
    }
  }, [filters, txPage, txPageSize]);

  const loadMeta = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      canDeposit ? authFetch("/api/finance/undeposited-sales") : Promise.resolve({ ok: false } as Response),
      authFetch("/api/finance/payment-methods"),
      authFetch("/api/finance/accounts"),
    ]);
    if (r1 && "ok" in r1 && r1.ok) setSales(await r1.json());
    if (r2.ok) {
      const pms = await r2.json();
      setMethods(pms.filter((p: { isActive: boolean }) => p.isActive));
    }
    if (r3.ok) setAccounts(await r3.json());
  }, [canDeposit]);

  useEffect(() => {
    if (!canView && !canDeposit && !canWithdraw) return;
    loadMeta();
  }, [canView, canDeposit, canWithdraw, loadMeta]);

  useEffect(() => {
    if (!canView) return;
    setLoadingTx(true);
    loadTx().finally(() => setLoadingTx(false));
  }, [filters, canView, loadTx]);

  async function submitDeposit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setDepSubmit(true);
    try {
      const body: Record<string, unknown> = {
        kind: "deposit",
        paymentMethodId: Number(depForm.paymentMethodId),
        description: depForm.description || null,
        transactionDate: depForm.transactionDate,
      };
      if (depForm.saleId) {
        body.saleId = Number(depForm.saleId);
      } else {
        body.amount = Number(depForm.amount);
      }
      const res = await authFetch("/api/finance/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Deposit failed");
        return;
      }
      setDepForm({
        paymentMethodId: methods[0] ? String(methods[0].id) : "",
        saleId: "",
        amount: "",
        description: "",
        transactionDate: new Date().toISOString().slice(0, 10),
      });
      await loadMeta();
      await loadTx();
    } finally {
      setDepSubmit(false);
    }
  }

  async function submitWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setWdSubmit(true);
    try {
      const res = await authFetch("/api/finance/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "withdrawal",
          accountId: Number(wdForm.accountId),
          amount: Number(wdForm.amount),
          description: wdForm.description || null,
          transactionDate: wdForm.transactionDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Withdrawal failed");
        return;
      }
      setWdForm({
        accountId: accounts[0] ? String(accounts[0].id) : "",
        amount: "",
        description: "",
        transactionDate: new Date().toISOString().slice(0, 10),
      });
      await loadMeta();
      await loadTx();
    } finally {
      setWdSubmit(false);
    }
  }

  useEffect(() => {
    if (methods.length && !depForm.paymentMethodId) {
      setDepForm((f) => ({ ...f, paymentMethodId: String(methods[0].id) }));
    }
  }, [methods]);

  useEffect(() => {
    if (accounts.length && !wdForm.accountId) {
      setWdForm((f) => ({ ...f, accountId: String(accounts[0].id) }));
    }
  }, [accounts]);

  if (!canView && !canDeposit && !canWithdraw) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Deposits & withdrawals" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Deposits & withdrawals" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Deposit pharmacy sale proceeds into an account via a payment method, or record withdrawals (admin).
        </p>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {msg}
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {canDeposit && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
            <h2 className="mb-4 text-lg font-semibold">Deposit</h2>
            <form onSubmit={submitDeposit} className="space-y-3">
              <div>
                <Label>Payment method (account) *</Label>
                <select
                  required
                  value={depForm.paymentMethodId}
                  onChange={(e) => setDepForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="">Select</option>
                  {methods.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name} → {m.account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Pharmacy sale (optional)</Label>
                <select
                  value={depForm.saleId}
                  onChange={(e) => setDepForm((f) => ({ ...f, saleId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="">Manual amount (no sale link)</option>
                  {sales.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      #{s.id} — ${s.totalAmount.toFixed(2)} ({new Date(s.saleDate).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
              {!depForm.saleId && (
                <div>
                  <Label>Amount *</Label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required={!depForm.saleId}
                    value={depForm.amount}
                    onChange={(e) => setDepForm((f) => ({ ...f, amount: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                  />
                </div>
              )}
              <DateField
                id="dep-transaction-date"
                label="Date"
                value={depForm.transactionDate}
                onChange={(v) => setDepForm((f) => ({ ...f, transactionDate: v }))}
                appendToBody
              />
              <div>
                <Label>Notes</Label>
                <input
                  value={depForm.description}
                  onChange={(e) => setDepForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <Button type="submit" disabled={depSubmit || methods.length === 0} size="sm">
                {depSubmit ? "Saving..." : "Record deposit"}
              </Button>
            </form>
          </div>
        )}

        {canWithdraw && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
            <h2 className="mb-4 text-lg font-semibold">Withdrawal</h2>
            <form onSubmit={submitWithdraw} className="space-y-3">
              <div>
                <Label>From account *</Label>
                <select
                  required
                  value={wdForm.accountId}
                  onChange={(e) => setWdForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="">Select</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name} (balance ${a.balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Amount *</Label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={wdForm.amount}
                  onChange={(e) => setWdForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <DateField
                id="wd-transaction-date"
                label="Date"
                value={wdForm.transactionDate}
                onChange={(v) => setWdForm((f) => ({ ...f, transactionDate: v }))}
                appendToBody
              />
              <div>
                <Label>Notes</Label>
                <input
                  value={wdForm.description}
                  onChange={(e) => setWdForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <Button type="submit" disabled={wdSubmit || accounts.length === 0} size="sm">
                {wdSubmit ? "Saving..." : "Record withdrawal"}
              </Button>
            </form>
          </div>
        )}
      </div>

      {canView && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <DateRangeFilter
              from={filters.from}
              to={filters.to}
              onFromChange={(v) => {
                setTxPage(1);
                setFilters((f) => ({ ...f, from: v }));
              }}
              onToChange={(v) => {
                setTxPage(1);
                setFilters((f) => ({ ...f, to: v }));
              }}
              onClear={() => {
                setTxPage(1);
                setFilters((f) => ({ ...f, from: "", to: "" }));
              }}
            />
            <select
              value={filters.accountId}
              onChange={(e) => {
                setTxPage(1);
                setFilters((f) => ({ ...f, accountId: e.target.value }));
              }}
              className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {loadingTx ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Date</TableCell>
                    <TableCell isHeader>Account</TableCell>
                    <TableCell isHeader>Type</TableCell>
                    <TableCell isHeader>Amount</TableCell>
                    <TableCell isHeader>Sale</TableCell>
                    <TableCell isHeader>By</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.transactionDate).toLocaleString()}</TableCell>
                      <TableCell>{t.account.name}</TableCell>
                      <TableCell className="capitalize">{t.kind}</TableCell>
                      <TableCell>{t.kind === "withdrawal" ? "-" : "+"}${t.amount.toFixed(2)}</TableCell>
                      <TableCell>{t.sale ? `#${t.sale.id}` : "—"}</TableCell>
                      <TableCell>{t.createdBy?.name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <ListPaginationFooter
              loading={loadingTx}
              total={txTotal}
              page={txPage}
              pageSize={txPageSize}
              noun="transactions"
              onPageChange={setTxPage}
            />
          </div>
        </>
      )}
    </>
  );
}
