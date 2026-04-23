"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/tables/Pagination";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PosIcon } from "@/icons";

type Branch = { id: number; name: string };

type SaleRow = {
  id: number;
  saleDate: string;
  totalAmount: number;
  discount: number;
  paymentMethod: string;
  customerType: string;
  outreachTeamId?: number | null;
  branchId?: number | null;
  branch: { id: number; name: string } | null;
  patient: { id: number; patientCode: string; name: string } | null;
  createdBy: { id: number; name: string | null } | null;
  depositTransaction: { id: number } | null;
  _count: { items: number };
};

export default function PharmacySalesListPage() {
  const { hasPermission } = useAuth();
  const { allBranchesLabel } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const defaultRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [rows, setRows] = useState<SaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canViewPos = hasPermission("pharmacy.pos");
  const canEditSale = hasPermission("pharmacy.edit") || hasPermission("pharmacy.pos");
  const canReturnSale = hasPermission("pharmacy.pos");
  const showSaleActions = hasPermission("pharmacy.view") || canEditSale || canReturnSale;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (branchId) params.set("branchId", branchId);
      const res = await authFetch(`/api/pharmacy/sales?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to load sales");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(body.data || []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    } finally {
      setLoading(false);
    }
  }, [page, from, to, branchId]);

  useEffect(() => {
    authFetch("/api/branches").then((r) => {
      if (r.ok) r.json().then((d: Branch[]) => setBranches(d || []));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [from, to, branchId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Sales list" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageBreadCrumb pageTitle="Sales list" />
        {canViewPos && (
          <Link href="/pharmacy/pos">
            <Button variant="outline" size="sm" startIcon={<PosIcon className="size-4 shrink-0" aria-hidden />}>
              Open POS
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <Label>Branch</Label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1.5 h-10 w-full min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-auto"
          >
            <option value="">{allBranchesLabel}</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
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
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No sales in this range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>#</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>Customer</TableCell>
                <TableCell isHeader>Lines</TableCell>
                <TableCell isHeader>Total</TableCell>
                <TableCell isHeader>Payment</TableCell>
                <TableCell isHeader>Recorded by</TableCell>
                <TableCell isHeader>Status</TableCell>
                {showSaleActions && (
                  <TableCell isHeader className="whitespace-nowrap">
                    Actions
                  </TableCell>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const cust =
                  s.customerType === "patient" && s.patient
                    ? `${s.patient.name} (${s.patient.patientCode})`
                    : "Walking";
                const hasDep = Boolean(s.depositTransaction?.id);
                const isOutreach = s.customerType === "outreach" || s.outreachTeamId != null;
                const branchPk = s.branch?.id ?? s.branchId;
                const viewHref = `/pharmacy/pos?viewSale=${s.id}`;
                const editHref = `/pharmacy/pos?editSale=${s.id}`;
                const returnHref =
                  branchPk != null
                    ? `/pharmacy/sale-returns?saleId=${s.id}&branchId=${branchPk}`
                    : `/pharmacy/sale-returns?saleId=${s.id}`;
                return (
                  <TableRow key={s.id}>
                    <TableCell>{new Date(s.saleDate).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell>{s.branch?.name ?? "—"}</TableCell>
                    <TableCell>{cust}</TableCell>
                    <TableCell>{s._count.items}</TableCell>
                    <TableCell className="font-medium">${s.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>{s.paymentMethod}</TableCell>
                    <TableCell>{s.createdBy?.name ?? "—"}</TableCell>
                    <TableCell>
                      {hasDep ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          Deposited
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </TableCell>
                    {showSaleActions && (
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          {hasPermission("pharmacy.view") && (
                            <Link href={viewHref}>
                              <Button size="sm" variant="outline">
                                View
                              </Button>
                            </Link>
                          )}
                          {canEditSale && !isOutreach && (
                            <Link href={editHref}>
                              <Button size="sm" variant="outline">
                                Edit
                              </Button>
                            </Link>
                          )}
                          {canReturnSale && !isOutreach && (
                            <Link href={returnHref}>
                              <Button size="sm" variant="outline">
                                Return
                              </Button>
                            </Link>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {fromIdx}–{toIdx} of {total} sales
            </p>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
