"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-pagination";
import Button from "@/components/ui/button/Button";
import type { LabInventoryUnitInput } from "@/lib/lab-inventory-units";

type Branch = { id: number; name: string };
type Row = {
  id: number;
  name: string;
  code: string;
  unit: string;
  quantity: number;
  sellingPrice: number;
  imageUrl: string | null;
  labUnits?: { unitKey: string; label: string; baseUnitsEach: number; sortOrder: number }[];
};

export default function LabInventoryPage() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEditLab = hasPermission("lab.edit");
  const canCreateLabStock = hasPermission("lab.create") || hasPermission("lab.edit");
  const [packModalId, setPackModalId] = useState<number | null>(null);
  const [packName, setPackName] = useState("");
  const [packRows, setPackRows] = useState<LabInventoryUnitInput[]>([]);
  const [packLoading, setPackLoading] = useState(false);
  const [packSaving, setPackSaving] = useState(false);
  const [packError, setPackError] = useState("");

  async function openPackModal(id: number) {
    setPackModalId(id);
    setPackError("");
    setPackLoading(true);
    try {
      const res = await authFetch(`/api/lab/inventory/${id}`);
      if (!res.ok) {
        setPackError((await res.json()).error || "Failed to load");
        setPackRows([]);
        return;
      }
      const item = await res.json();
      setPackName(typeof item.name === "string" ? item.name : "");
      const u = Array.isArray(item.labUnits) ? item.labUnits : [];
      setPackRows(
        u.map((x: { unitKey: string; label: string; baseUnitsEach: number; sortOrder?: number }) => ({
          unitKey: x.unitKey,
          label: x.label,
          baseUnitsEach: x.baseUnitsEach,
          sortOrder: x.sortOrder ?? 0,
        }))
      );
    } finally {
      setPackLoading(false);
    }
  }

  async function savePackaging() {
    if (packModalId == null) return;
    setPackSaving(true);
    setPackError("");
    try {
      const res = await authFetch(`/api/lab/inventory/${packModalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labUnits: packRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPackError(data.error || "Failed to save");
        return;
      }
      setPackModalId(null);
      await load();
    } finally {
      setPackSaving(false);
    }
  }

  const load = useCallback(async () => {
    if (!branchId) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        branchId,
        page: String(page),
        pageSize: String(DEFAULT_LIST_PAGE_SIZE),
      });
      const res = await authFetch(`/api/lab/inventory?${params.toString()}`);
      const json = res.ok ? await res.json() : null;
      if (!res.ok || !json || typeof json !== "object" || !Array.isArray(json.data)) {
        setError((json && typeof json === "object" && "error" in json && String((json as { error?: string }).error)) || "Failed to load");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(json.data as Row[]);
      setTotal(typeof json.total === "number" ? json.total : json.data.length);
    } catch {
      setError("Failed to load");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [branchId, page]);

  useEffect(() => {
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    const q = searchParams.get("branchId");
    if (q) {
      const n = Number(q);
      if (Number.isInteger(n) && n > 0 && branches.some((b) => b.id === n)) {
        setBranchId(String(n));
        return;
      }
    }
    setBranchId((prev) => {
      if (prev) return prev;
      if (singleAssignedBranchId) return String(singleAssignedBranchId);
      return String(branches[0].id);
    });
  }, [branches, singleAssignedBranchId, searchParams]);

  useEffect(() => {
    setPage(1);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || total <= 0) return;
    const maxPage = Math.max(1, Math.ceil(total / DEFAULT_LIST_PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [loading, total, page]);

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab inventory" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Lab inventory" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>Branch</Label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 px-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {canCreateLabStock ? (
          <Link
            href={branchId ? `/lab/inventory/new?branchId=${encodeURIComponent(branchId)}` : "/lab/inventory/new"}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            Add lab stock item
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-500">Loading…</p>
        ) : total === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No items for this branch.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="w-16">
                    <span className="sr-only">Image</span>
                  </TableCell>
                  <TableCell isHeader>Code</TableCell>
                  <TableCell isHeader>Name</TableCell>
                  <TableCell isHeader>Unit</TableCell>
                  <TableCell isHeader className="text-right">Qty</TableCell>
                  <TableCell isHeader className="text-right">Lab POS $</TableCell>
                  {canEditLab ? <TableCell isHeader className="text-right">Packaging</TableCell> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="w-16 align-middle">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                        {r.imageUrl ? (
                          <Image
                            src={r.imageUrl}
                            alt={r.name}
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-semibold text-gray-400" aria-hidden>
                            {(r.name || r.code || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.sellingPrice.toFixed(2)}</TableCell>
                    {canEditLab ? (
                      <TableCell className="text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => openPackModal(r.id)}>
                          {r.labUnits && r.labUnits.length > 1 ? `${r.labUnits.length} units` : "Units"}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPaginationFooter
              loading={false}
              total={total}
              page={page}
              pageSize={DEFAULT_LIST_PAGE_SIZE}
              noun="items"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {packModalId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Lab packaging units</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{packName}</p>
            <p className="mt-2 text-xs text-gray-500">
              Quantity on hand is in <strong className="font-medium">base</strong> units. Each row defines how many base
              units equal one count of that packaging (e.g. pair = 2 base pcs).
            </p>
            {packError ? (
              <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {packError}
              </div>
            ) : null}
            {packLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="mt-4 space-y-3">
                {packRows.map((row, idx) => (
                  <div key={idx} className="grid gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-700 sm:grid-cols-3">
                    <div>
                      <Label>Key</Label>
                      <input
                        value={row.unitKey}
                        disabled={row.unitKey === "base"}
                        onChange={(e) =>
                          setPackRows((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, unitKey: e.target.value } : x))
                          )
                        }
                        onBlur={(e) =>
                          setPackRows((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, unitKey: e.target.value.trim().toLowerCase() } : x
                            )
                          )
                        }
                        className="mt-1 h-10 w-full rounded border border-gray-200 px-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-900"
                      />
                    </div>
                    <div>
                      <Label>Label</Label>
                      <input
                        value={row.label}
                        onChange={(e) =>
                          setPackRows((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                        }
                        className="mt-1 h-10 w-full rounded border border-gray-200 px-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      />
                    </div>
                    <div>
                      <Label>Base units each</Label>
                      <input
                        type="number"
                        min={1}
                        value={row.baseUnitsEach}
                        disabled={row.unitKey === "base"}
                        onChange={(e) =>
                          setPackRows((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, baseUnitsEach: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x
                            )
                          )
                        }
                        className="mt-1 h-10 w-full rounded border border-gray-200 px-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      />
                    </div>
                    {row.unitKey !== "base" ? (
                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          className="text-xs text-error-600 hover:underline"
                          onClick={() => setPackRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  onClick={() =>
                    setPackRows((prev) => [
                      ...prev,
                      { unitKey: "pair", label: "Pair", baseUnitsEach: 2, sortOrder: prev.length },
                    ])
                  }
                >
                  + Add packaging (e.g. pair)
                </button>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPackModalId(null)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={packSaving || packLoading} onClick={() => void savePackaging()}>
                {packSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
