"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { printPatientPaymentReceipt } from "@/lib/patient-payment-receipt-print";
import { patientPaymentCategoryLabel } from "@/lib/patient-payment-utils";

export type PatientPaymentListRow = {
  id: number;
  amount: number;
  discount: number;
  category: string;
  notes: string | null;
  labOrderId: number | null;
  batchGroupId: string | null;
  createdAt: string;
  cancelledAt: string | null;
  patient: { patientCode: string; name: string; phone?: string | null; mobile?: string | null };
  paymentMethod: { id: number; name: string } | null;
  createdBy: { id: number; name: string | null } | null;
  cancelledBy: { id: number; name: string | null } | null;
};

export default function PatientPaymentList() {
  const { hasPermission, user } = useAuth();
  const canCancelPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");
  const canList =
    hasPermission("accounts.deposit") ||
    hasPermission("pharmacy.pos") ||
    hasPermission("accounts.view");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<PatientPaymentListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [q, from, to]);

  useEffect(() => {
    if (!canList) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    authFetch(`/api/finance/patient-payments?${params}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body.data && typeof body.total === "number") {
          setRows(body.data);
          setTotal(body.total);
        } else {
          setRows([]);
          setTotal(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canList, page, q, from, to]);

  async function cancelPayment(r: PatientPaymentListRow) {
    if (!canCancelPayment || r.cancelledAt) return;
    const ok = window.confirm(
      `Cancel this payment? The client balance will be increased by the cash and discount that were applied (if you split one payment across several categories, every linked line is cancelled together). A matching withdrawal is posted to the finance account when cash was deposited.`
    );
    if (!ok) return;
    setCancellingId(r.id);
    try {
      const res = await authFetch(`/api/finance/patient-payments/${r.id}/cancel`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(typeof body.error === "string" ? body.error : "Could not cancel payment");
        return;
      }
      const cancelledIds: number[] = Array.isArray(body.cancelledIds)
        ? body.cancelledIds.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n))
        : [];
      const byName = user?.name?.trim() || null;
      setRows((prev) =>
        prev.map((row) =>
          cancelledIds.includes(row.id)
            ? {
                ...row,
                cancelledAt: new Date().toISOString(),
                cancelledBy: { id: 0, name: byName },
              }
            : row
        )
      );
    } finally {
      setCancellingId(null);
    }
  }

  function printReceipt(r: PatientPaymentListRow) {
    void printPatientPaymentReceipt({
      id: r.id,
      createdAt: r.createdAt,
      patientCode: r.patient.patientCode,
      patientName: r.patient.name,
      patientPhone: r.patient.phone ?? r.patient.mobile ?? null,
      category: r.category,
      amount: r.amount,
      discount: r.discount,
      paymentMethodName: r.paymentMethod?.name ?? null,
      recordedByName: r.createdBy?.name ?? null,
      notes: r.notes,
      labOrderId: r.labOrderId,
    });
  }

  const pageTitle = "Payment list";

  if (!canList) {
    return (
      <div>
        <PageBreadCrumb pageTitle={pageTitle} />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">You do not have access to payment lists.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={pageTitle} />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/financial-reports" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Financial reports
          </Link>
          <Link href="/payments" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Client balances
          </Link>
          <Link href="/payments/new" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Record payment
          </Link>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Label>Search client</Label>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name, code, phone…"
            className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div>
          <Label>From</Label>
          <div className="mt-1">
            <DateField value={from} onChange={setFrom} />
          </div>
        </div>
        <div>
          <Label>To</Label>
          <div className="mt-1">
            <DateField value={to} onChange={setTo} />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">No payments found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Client</TableCell>
                <TableCell isHeader>Category</TableCell>
                <TableCell isHeader className="text-right">
                  Cash
                </TableCell>
                <TableCell isHeader className="text-right">
                  Discount
                </TableCell>
                <TableCell isHeader className="text-right">
                  Total
                </TableCell>
                <TableCell isHeader>Method</TableCell>
                <TableCell isHeader>By</TableCell>
                <TableCell isHeader className="text-right">
                  Receipt
                </TableCell>
                {canCancelPayment ? (
                  <TableCell isHeader className="text-right">
                    Cancel
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const dt = new Date(r.createdAt);
                const dateStr = Number.isNaN(dt.getTime())
                  ? "—"
                  : dt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
                const totalLine = (r.amount ?? 0) + (r.discount ?? 0);
                const isCancelled = Boolean(r.cancelledAt);
                return (
                  <TableRow key={r.id} className={isCancelled ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{dateStr}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-white">{r.patient.name}</div>
                      <div className="font-mono text-xs text-gray-500">{r.patient.patientCode}</div>
                      {isCancelled ? (
                        <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                          Cancelled
                          {r.cancelledBy?.name ? ` · ${r.cancelledBy.name}` : ""}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                      {patientPaymentCategoryLabel(r.category)}
                      {r.labOrderId ? (
                        <span className="mt-0.5 block text-xs text-gray-500">Lab #{r.labOrderId}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">${(r.amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${(r.discount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">${totalLine.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">{r.paymentMethod?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">{r.createdBy?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" type="button" onClick={() => printReceipt(r)}>
                        Print
                      </Button>
                    </TableCell>
                    {canCancelPayment ? (
                      <TableCell className="text-right">
                        {!isCancelled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="border-error-200 text-error-700 hover:bg-error-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
                            disabled={cancellingId === r.id}
                            onClick={() => void cancelPayment(r)}
                          >
                            {cancellingId === r.id ? "…" : "Cancel payment"}
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="payments"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
