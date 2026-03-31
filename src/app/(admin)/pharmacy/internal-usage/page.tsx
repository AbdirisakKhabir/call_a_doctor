"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import Link from "next/link";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Branch = { id: number; name: string };

type InternalProduct = {
  id: number;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  internalPurpose: string | null;
};

type LogRow = {
  id: number;
  quantity: number;
  purpose: string;
  notes: string | null;
  createdAt: string;
  product: { id: number; name: string; code: string; unit: string; internalPurpose: string | null };
  branch: { id: number; name: string } | null;
  createdBy: { id: number; name: string | null; email: string } | null;
};

function purposeLabel(p: string) {
  if (p === "laboratory") return "Laboratory";
  if (p === "cleaning") return "Cleaning";
  return "General";
}

export default function InternalUsagePage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches, hasMultipleAssignedBranches, allBranchesLabel } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [logBranchFilter, setLogBranchFilter] = useState("");
  const [products, setProducts] = useState<InternalProduct[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string; unit: string }[]>([
    { productId: "", quantity: "1", unit: "pcs" },
  ]);
  const [form, setForm] = useState({
    purpose: "general" as "laboratory" | "cleaning" | "general",
    notes: "",
  });

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

  async function loadInternalProducts() {
    if (!branchId) {
      setProducts([]);
      return;
    }
    const res = await authFetch(
      `/api/pharmacy/products?stockType=internal&branchId=${encodeURIComponent(branchId)}`
    );
    if (res.ok) setProducts(await res.json());
  }

  async function loadLogs() {
    const params = new URLSearchParams();
    if (logBranchFilter) params.set("branchId", logBranchFilter);
    params.set("page", String(logPage));
    params.set("pageSize", String(logPageSize));
    const res = await authFetch(`/api/pharmacy/internal-usage?${params}`);
    if (res.ok) {
      const body = await res.json();
      setLogs(body.data ?? []);
      setLogTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadBranches().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setLines([{ productId: "", quantity: "1", unit: "pcs" }]);
    loadInternalProducts();
  }, [branchId]);

  useEffect(() => {
    setLogPage(1);
  }, [logBranchFilter]);

  useEffect(() => {
    setLogsLoading(true);
    loadLogs().finally(() => setLogsLoading(false));
  }, [logBranchFilter, logPage]);

  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: "1", unit: "pcs" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateLine(index: number, patch: Partial<{ productId: string; quantity: string; unit: string }>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!branchId) {
      setError("Select a branch.");
      return;
    }
    const items = lines
      .map((line) => ({
        productId: Number(line.productId),
        quantity: Math.max(1, Math.floor(Number(line.quantity) || 0)),
        unit: line.unit || "pcs",
      }))
      .filter((line) => Number.isInteger(line.productId) && line.productId > 0);
    if (items.length === 0) {
      setError("Add at least one product and quantity.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/pharmacy/internal-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          purpose: form.purpose,
          notes: form.notes.trim() || null,
          branchId: Number(branchId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to record usage");
        return;
      }
      setLines([{ productId: "", quantity: "1", unit: "pcs" }]);
      setForm((f) => ({ ...f, notes: "" }));
      await Promise.all([loadInternalProducts(), loadLogs()]);
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Internal usage" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Internal usage" />
        <Link href="/pharmacy/inventory" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Back to inventory
        </Link>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Record supplies used for laboratory work, cleaning, or general operations. Add several products in one submission
        (same purpose and notes for the batch). Stock is reduced here (not through POS). Only items marked as internal
        (non-sale) in inventory appear below.
      </p>

      <div className="mb-8 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
        <h2 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Record usage</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>
          )}
          <div>
            <Label>Branch *</Label>
            <select
              value={branchId}
              disabled={branches.length === 1}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm disabled:opacity-75 dark:border-gray-700 dark:text-white"
            >
              {branches.length === 0 ? (
                <option value="">No branches</option>
              ) : (
                branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <Label>Products *</Label>
            <div className="mt-2 space-y-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/20 sm:flex-row sm:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <Label className="text-xs">Product</Label>
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(index, { productId: e.target.value })}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="">Select internal item…</option>
                      {products.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name} ({p.code}) — {p.quantity} pcs in stock
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-28">
                    <Label className="text-xs">Unit</Label>
                    <select
                      value={line.unit}
                      onChange={(e) => updateLine(index, { unit: e.target.value })}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="pcs">pcs</option>
                      <option value="box">Box</option>
                      <option value="carton">Carton</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-24">
                    <Label className="text-xs">Qty</Label>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 1}
                    className="h-11 shrink-0 rounded-lg px-3 text-sm text-error-600 hover:bg-error-50 disabled:opacity-40 dark:hover:bg-error-500/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              disabled={products.length === 0}
              className="mt-2 text-sm font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
            >
              + Add product
            </button>
            {products.length === 0 && !loading && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                No internal items yet. Add products as &quot;Internal (not for sale)&quot; in Opening inventory.
              </p>
            )}
          </div>
          <div>
            <Label>Purpose *</Label>
            <select
              value={form.purpose}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  purpose: e.target.value as "laboratory" | "cleaning" | "general",
                }))
              }
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="laboratory">Laboratory</option>
              <option value="cleaning">Cleaning</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <Label>Notes</Label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <Button type="submit" size="sm" disabled={submitting || !branchId || products.length === 0}>
            {submitting ? "Saving…" : "Deduct from stock"}
          </Button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Recent internal usage</h3>
          {(seesAllBranches || hasMultipleAssignedBranches) && branches.length > 1 ? (
            <div>
              <Label>Branch filter</Label>
              <select
                value={logBranchFilter}
                onChange={(e) => setLogBranchFilter(e.target.value)}
                className="mt-1 h-10 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">{allBranchesLabel}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {logsLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : logTotal === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">No usage logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Product</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>Qty</TableCell>
                <TableCell isHeader>Purpose</TableCell>
                <TableCell isHeader>By</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.product.name}</span>
                    <span className="ml-1 font-mono text-xs text-gray-500">{row.product.code}</span>
                  </TableCell>
                  <TableCell>{row.branch?.name || "—"}</TableCell>
                  <TableCell>
                    {row.quantity} {row.product.unit}
                  </TableCell>
                  <TableCell>
                    <Badge color="light" size="sm">
                      {purposeLabel(row.purpose)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                    {row.createdBy?.name || row.createdBy?.email || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={logsLoading}
          total={logTotal}
          page={logPage}
          pageSize={logPageSize}
          noun="entries"
          onPageChange={setLogPage}
        />
      </div>
    </div>
  );
}
