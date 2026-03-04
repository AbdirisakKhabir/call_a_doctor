"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { DownloadIcon } from "@/icons";

type Bank = { id: number; name: string; code: string };
type Transaction = {
  id: number;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
  bank: { id: number; name: string; code: string };
  student: { studentId: string; firstName: string; lastName: string } | null;
  createdBy: { name: string | null; email: string } | null;
};

export default function TransactionHistoryReportPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankId, setBankId] = useState("");
  const [type, setType] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankId) params.set("bankId", bankId);
      if (type) params.set("type", type);
      params.set("dateFrom", dateFrom);
      params.set("dateTo", dateTo);
      params.set("limit", "200");
      const res = await authFetch(`/api/finance/transaction-history?${params}`);
      if (res.ok) setTransactions(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, [bankId, type, dateFrom, dateTo]);

  useEffect(() => {
    authFetch("/api/banks").then((r) => { if (r.ok) r.json().then(setBanks); });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => window.print();
  const handleExportCSV = () => {
    const headers = ["Date", "Type", "Bank", "Amount", "Description", "Student", "Recorded By"];
    const rows = transactions.map((t) => [
      new Date(t.createdAt).toLocaleString(),
      t.type,
      t.bank?.code || "",
      t.amount.toFixed(2),
      t.description || "",
      t.student ? `${t.student.firstName} ${t.student.lastName} (${t.student.studentId})` : "",
      t.createdBy?.name || t.createdBy?.email || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transaction_History_${dateFrom}_to_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const typeBadge = (t: string) => {
    const colors: Record<string, "success" | "error" | "info" | "primary"> = {
      deposit: "success",
      withdrawal: "error",
      transfer_out: "info",
      transfer_in: "primary",
    };
    const labels: Record<string, string> = {
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      transfer_out: "Transfer Out",
      transfer_in: "Transfer In",
    };
    return <Badge color={colors[t] || "info"} size="sm">{labels[t] || t}</Badge>;
  };

  return (
    <div className="report-print-area">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Transaction History" />
        <div className="flex gap-2">
          <Link href="/reports/payment">
            <Button variant="outline" size="sm">← All Reports</Button>
          </Link>
          <Button variant="outline" size="sm" startIcon={<DownloadIcon />} onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button size="sm" onClick={handlePrint}>Print</Button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/5 no-print">
        <h3 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Filters</h3>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Bank</label>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="h-10 min-w-[180px] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All Banks</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.code} - {b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-10 min-w-[140px] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All Types</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer_out">Transfer Out</option>
              <option value="transfer_in">Transfer In</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>
      </div>

      <div className="mb-4 print:block hidden">
        <h1 className="text-xl font-bold text-gray-900">Transaction History</h1>
        <p className="text-sm text-gray-600">Auto-generated log of all financial transactions | {dateFrom} to {dateTo}</p>
      </div>

      {!loading && transactions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/5">
          <div className="rounded-lg bg-green-50 px-4 py-2 dark:bg-green-500/10">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total In (Deposits + Transfers In): </span>
            <span className="font-bold text-green-600 dark:text-green-400">
              ${transactions
                .filter((t) => t.type === "deposit" || t.type === "transfer_in")
                .reduce((s, t) => s + t.amount, 0)
                .toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg bg-red-50 px-4 py-2 dark:bg-red-500/10">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Out (Withdrawals + Transfers Out): </span>
            <span className="font-bold text-red-600 dark:text-red-400">
              ${transactions
                .filter((t) => t.type === "withdrawal" || t.type === "transfer_out")
                .reduce((s, t) => s + t.amount, 0)
                .toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg bg-brand-50 px-4 py-2 dark:bg-brand-500/10">
            <span className="text-sm text-gray-600 dark:text-gray-400">Net: </span>
            <span
              className={`font-bold ${
                transactions.filter((t) => t.type === "deposit" || t.type === "transfer_in").reduce((s, t) => s + t.amount, 0) -
                  transactions.filter((t) => t.type === "withdrawal" || t.type === "transfer_out").reduce((s, t) => s + t.amount, 0) >=
                0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              $
              {(
                transactions.filter((t) => t.type === "deposit" || t.type === "transfer_in").reduce((s, t) => s + t.amount, 0) -
                transactions.filter((t) => t.type === "withdrawal" || t.type === "transfer_out").reduce((s, t) => s + t.amount, 0)
              ).toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-2 dark:bg-gray-800/50">
            <span className="text-sm text-gray-600 dark:text-gray-400">Transactions: </span>
            <span className="font-bold text-gray-800 dark:text-white/90">{transactions.length}</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            No transactions in this period. Transactions are created automatically when you record payments, withdrawals, or transfers.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Type</TableCell>
                <TableCell isHeader>Bank</TableCell>
                <TableCell isHeader>Amount</TableCell>
                <TableCell isHeader>Description</TableCell>
                <TableCell isHeader>Student</TableCell>
                <TableCell isHeader className="no-print">Recorded By</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(t.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{typeBadge(t.type)}</TableCell>
                  <TableCell className="font-mono text-sm">{t.bank?.code}</TableCell>
                  <TableCell className={`font-semibold ${
                    t.type === "deposit" || t.type === "transfer_in" ? "text-green-600" : "text-red-600"
                  }`}>
                    {t.type === "deposit" || t.type === "transfer_in" ? "+" : "-"}${t.amount.toLocaleString()}
                  </TableCell>
                  <TableCell><span className="max-w-[200px] truncate block" title={t.description || ""}>{t.description || "—"}</span></TableCell>
                  <TableCell>
                    {t.student
                      ? `${t.student.firstName} ${t.student.lastName} (${t.student.studentId})`
                      : "—"}
                  </TableCell>
                  <TableCell className="no-print text-sm text-gray-500">
                    {t.createdBy?.name || t.createdBy?.email || "—"}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length > 0 && (
                <TableRow className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                  <TableCell colSpan={3} className="text-right">
                    Total
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-green-600">
                      +${transactions.filter((t) => t.type === "deposit" || t.type === "transfer_in").reduce((s, t) => s + t.amount, 0).toLocaleString()}
                    </span>
                    {" / "}
                    <span className="text-red-600">
                      -${transactions.filter((t) => t.type === "withdrawal" || t.type === "transfer_out").reduce((s, t) => s + t.amount, 0).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell colSpan={3}>&nbsp;</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
