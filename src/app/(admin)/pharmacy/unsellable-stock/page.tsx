"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import Link from "next/link";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import ExpiryDateBadge from "@/components/pharmacy/ExpiryDateBadge";
import { unsellableReasonLabel } from "@/lib/unsellable-stock";

type Branch = { id: number; name: string };

type BalanceRow = {
  id: number;
  name: string;
  code: string;
  unit: string;
  quantity: number;
  unsellableQuantity: number;
  expiryDate: string | null;
  forSale: boolean;
  branch: { id: number; name: string };
  category: { id: number; name: string } | null;
};

type LogRow = {
  id: number;
  quantity: number;
  reason: string;
  notes: string | null;
  createdAt: string;
  product: { id: number; name: string; code: string; unit: string };
  branch: { id: number; name: string };
  createdBy: { id: number; name: string | null; email: string } | null;
};

export default function UnsellableStockPage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches, allBranchesLabel } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [movingExpired, setMovingExpired] = useState(false);
  const [error, setError] = useState("");
  const [moveExpiredMessage, setMoveExpiredMessage] = useState("");

  const canView = hasPermission("pharmacy.view");
  const canEdit = hasPermission("pharmacy.edit");

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
  }

  async function loadBalances() {
    if (!branchId) {
      setBalances([]);
      return;
    }
    const res = await authFetch(
      `/api/pharmacy/unsellable-stock?list=balances&branchId=${encodeURIComponent(branchId)}`
    );
    if (res.ok) {
      const body = await res.json();
      setBalances(Array.isArray(body.balances) ? body.balances : []);
    }
  }

  async function loadLogs() {
    if (!branchId) {
      setLogs([]);
      setLogTotal(0);
      return;
    }
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("branchId", branchId);
      params.set("page", String(logPage));
      params.set("pageSize", String(logPageSize));
      const res = await authFetch(`/api/pharmacy/unsellable-stock?${params}`);
      if (res.ok) {
        const body = await res.json();
        setLogs(Array.isArray(body.data) ? body.data : []);
        setLogTotal(typeof body.total === "number" ? body.total : 0);
      }
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    setLogPage(1);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    loadBalances().finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    loadLogs();
  }, [branchId, logPage]);

  async function handleMoveExpired() {
    if (!branchId || !canEdit) return;
    if (
      !confirm(
        "Move all sellable stock for products whose expiry date is before today into unsellable stock? This cannot be undone from this screen."
      )
    ) {
      return;
    }
    setMovingExpired(true);
    setError("");
    setMoveExpiredMessage("");
    try {
      const res = await authFetch("/api/pharmacy/unsellable-stock/move-expired", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: Number(branchId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      setMoveExpiredMessage(
        data.movedProducts > 0
          ? `Moved ${data.movedProducts} product line(s) (${data.totalBaseUnits?.toLocaleString?.() ?? data.totalBaseUnits} base units).`
          : data.message || "Nothing to move."
      );
      await loadBalances();
      await loadLogs();
    } finally {
      setMovingExpired(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Unsellable stock" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Unsellable stock" />
        <Link
          href="/pharmacy/inventory"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Pharmacy inventory
        </Link>
      </div>

      <p className="mb-6 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Non-sellable inventory: stock that is no longer offered for sale (typically expired, damaged, or recalled). Sellable
        quantity is reduced; unsellable balances are tracked here for disposal or write-off records.
      </p>

      {seesAllBranches && (
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          Branch scope: {allBranchesLabel}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <Label>Branch</Label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 min-w-[12rem] rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {canEdit && branchId ? (
          <Button type="button" size="sm" variant="outline" disabled={movingExpired} onClick={handleMoveExpired}>
            {movingExpired ? "Working…" : "Move expired sellable stock"}
          </Button>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      {moveExpiredMessage && (
        <div className="mb-4 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/15 dark:text-success-200">
          {moveExpiredMessage}
        </div>
      )}

      <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Current unsellable balances</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Products with quantity held as non-sellable at this branch.
        </p>
        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : balances.length === 0 ? (
            <p className="text-sm text-gray-500">No unsellable stock recorded for this branch.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Code</TableCell>
                  <TableCell isHeader>Product</TableCell>
                  <TableCell isHeader>Category</TableCell>
                  <TableCell isHeader>Type</TableCell>
                  <TableCell isHeader className="text-right">Sellable qty</TableCell>
                  <TableCell isHeader className="text-right">Unsellable qty</TableCell>
                  <TableCell isHeader>Expiry</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge color="light" size="sm">
                        {r.category?.name ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.forSale ? (
                        <Badge color="success" size="sm">
                          Retail
                        </Badge>
                      ) : (
                        <Badge color="warning" size="sm">
                          Internal
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.quantity.toLocaleString()} {r.unit || "pcs"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-amber-700 dark:text-amber-300">
                      {r.unsellableQuantity.toLocaleString()} {r.unit || "pcs"}
                    </TableCell>
                    <TableCell>
                      <ExpiryDateBadge expiryDate={r.expiryDate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movement history</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Transfers from sellable to unsellable stock.</p>
        <div className="mt-4 overflow-x-auto">
          {logsLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-500">No movements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Date</TableCell>
                  <TableCell isHeader>Product</TableCell>
                  <TableCell isHeader>Reason</TableCell>
                  <TableCell isHeader className="text-right">Qty</TableCell>
                  <TableCell isHeader>By</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-gray-500">{log.product.code}</span>
                      <div className="font-medium">{log.product.name}</div>
                    </TableCell>
                    <TableCell>{unsellableReasonLabel(log.reason)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {log.quantity.toLocaleString()} {log.product.unit || "pcs"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {log.createdBy?.name || log.createdBy?.email || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <ListPaginationFooter
          loading={logsLoading}
          total={logTotal}
          page={logPage}
          pageSize={logPageSize}
          noun="movements"
          onPageChange={setLogPage}
        />
      </section>
    </div>
  );
}
