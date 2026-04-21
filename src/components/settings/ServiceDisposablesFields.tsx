"use client";

import React, { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { TrashBinIcon } from "@/icons";
import { authFetch } from "@/lib/api";

export type BranchOpt = { id: number; name: string };

type SaleUnitOpt = { unitKey: string; label: string; baseUnitsEach: number };

type ProductSearchHit = {
  id: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  saleUnits: SaleUnitOpt[];
};

type SavedDisposableRow = {
  id: number;
  productCode: string;
  unitsPerService: number;
  deductionUnitKey: string;
  deductionUnitLabel: string;
  saleUnits: SaleUnitOpt[];
  productName: string | null;
  stockUnit: string | null;
};

type Props = {
  serviceId: number;
  branches: BranchOpt[];
  disposableBranchId: string;
  onDisposableBranchIdChange: (id: string) => void;
  canEdit: boolean;
};

export default function ServiceDisposablesFields({
  serviceId,
  branches,
  disposableBranchId,
  onDisposableBranchIdChange,
  canEdit,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [productHints, setProductHints] = useState<ProductSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pickedProduct, setPickedProduct] = useState<{
    code: string;
    name: string;
    saleUnits: SaleUnitOpt[];
  } | null>(null);
  const [newUnits, setNewUnits] = useState("1");
  const [newUnitKey, setNewUnitKey] = useState("base");
  const [codeUnits, setCodeUnits] = useState<SaleUnitOpt[]>([]);
  const [dispError, setDispError] = useState("");
  const [savedRows, setSavedRows] = useState<SavedDisposableRow[]>([]);
  const [dispLoading, setDispLoading] = useState(false);

  const loadSaved = useCallback(
    async (sid: number, branchIdForLookup: string) => {
      setDispLoading(true);
      setDispError("");
      try {
        const q =
          branchIdForLookup && Number(branchIdForLookup) > 0
            ? `?branchId=${encodeURIComponent(branchIdForLookup)}`
            : "";
        const r = await authFetch(`/api/services/${sid}/disposables${q}`);
        const data = r.ok ? await r.json() : [];
        setSavedRows(Array.isArray(data) ? data : []);
      } finally {
        setDispLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadSaved(serviceId, disposableBranchId);
    setSearchQuery("");
    setProductHints([]);
    setPickedProduct(null);
    setNewUnits("1");
    setNewUnitKey("base");
    setDispError("");
    setCodeUnits([]);
  }, [serviceId, disposableBranchId, loadSaved]);

  useEffect(() => {
    const bid = disposableBranchId ? Number(disposableBranchId) : null;
    const q = searchQuery.trim();
    if (!bid || !Number.isInteger(bid) || q.length < 2) {
      setProductHints([]);
      setSearchLoading(false);
      return;
    }
    if (pickedProduct && `${pickedProduct.name} (${pickedProduct.code})` === searchQuery) {
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = setTimeout(() => {
      authFetch(`/api/pharmacy/products?branchId=${bid}&stockType=all&search=${encodeURIComponent(q)}`)
        .then(async (r) => {
          if (!r.ok) return [];
          const raw = await r.json();
          const list = Array.isArray(raw) ? raw : raw?.data;
          if (!Array.isArray(list)) return [];
          return list.slice(0, 15).map(
            (p: {
              id: number;
              code: string;
              name: string;
              unit?: string;
              quantity?: number;
              saleUnits?: SaleUnitOpt[];
            }) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              unit: p.unit || "pcs",
              quantity: typeof p.quantity === "number" ? p.quantity : 0,
              saleUnits: Array.isArray(p.saleUnits) ? p.saleUnits : [],
            })
          ) as ProductSearchHit[];
        })
        .then((list) => {
          if (!cancelled) setProductHints(list);
        })
        .catch(() => {
          if (!cancelled) setProductHints([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, disposableBranchId, pickedProduct]);

  function selectProductFromSearch(p: ProductSearchHit) {
    const su = p.saleUnits.length
      ? p.saleUnits
      : [{ unitKey: "base", label: "Base (pcs)", baseUnitsEach: 1 }];
    setPickedProduct({ code: p.code, name: p.name, saleUnits: su });
    setCodeUnits(su);
    setSearchQuery(`${p.name} (${p.code})`);
    setProductHints([]);
    const keys = su.map((u) => u.unitKey);
    setNewUnitKey(keys.includes("base") ? "base" : keys[0] ?? "base");
  }

  function clearProductPick() {
    setPickedProduct(null);
    setSearchQuery("");
    setProductHints([]);
    setCodeUnits([]);
    setNewUnitKey("base");
  }

  async function addDisposable() {
    setDispError("");
    const codeRaw = pickedProduct?.code ?? searchQuery.trim();
    if (!codeRaw) {
      setDispError("Search for a product and choose a row, or type a product code.");
      return;
    }
    const units = Number(newUnits);
    if (!Number.isFinite(units) || units <= 0) {
      setDispError("Enter a positive number for units per service.");
      return;
    }
    const res = await authFetch(`/api/services/${serviceId}/disposables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: codeRaw,
        unitsPerService: units,
        deductionUnitKey: newUnitKey,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDispError(data.error || "Failed to add");
      return;
    }
    await loadSaved(serviceId, disposableBranchId);
    clearProductPick();
    setNewUnits("1");
  }

  async function removeDisposable(id: number) {
    if (!canEdit) return;
    const res = await authFetch(`/api/services/${serviceId}/disposables/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      setDispError(j.error || "Failed to remove");
      return;
    }
    await loadSaved(serviceId, disposableBranchId);
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Service disposables</h2>

      <div className="mt-4 max-w-md">
        <Label>Branch for product lookup</Label>
        <select
          value={disposableBranchId}
          onChange={(e) => onDisposableBranchIdChange(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          <option value="">Select branch…</option>
          {branches.map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {canEdit && disposableBranchId && (
        <div className="mt-4 space-y-3">
          <div className="relative min-w-0 max-w-xl">
            <Label>Product *</Label>
            <p className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
              Search by product name or code at this branch, then pick a row. You can also type a code manually if you
              know it exactly.
            </p>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPickedProduct(null);
              }}
              autoComplete="off"
              placeholder="e.g. gloves, syringe, or SKU…"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            {searchLoading && (
              <p className="mt-1 text-xs text-gray-500">Searching…</p>
            )}
            {productHints.length > 0 && (
              <ul
                className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                role="listbox"
              >
                {productHints.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectProductFromSearch(p)}
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {p.code}
                        <span className="ml-2 font-sans text-gray-400">
                          · Stock {p.quantity} {p.unit}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pickedProduct && (
              <button
                type="button"
                onClick={clearProductPick}
                className="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Units per service</Label>
              <input
                type="number"
                step="any"
                min="0.01"
                value={newUnits}
                onChange={(e) => setNewUnits(e.target.value)}
                className="mt-1 h-11 w-28 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <Label>Deduct as</Label>
              <select
                value={newUnitKey}
                onChange={(e) => setNewUnitKey(e.target.value)}
                className="mt-1 h-11 min-w-32 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {(codeUnits.length ? codeUnits : [{ unitKey: "base", label: "Base (pcs)", baseUnitsEach: 1 }]).map(
                  (u) => (
                    <option key={u.unitKey} value={u.unitKey}>
                      {u.label}
                    </option>
                  )
                )}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addDisposable}
              disabled={!searchQuery.trim()}
            >
              Add disposable
            </Button>
          </div>
        </div>
      )}

      {dispError && (
        <p className="mt-2 text-sm text-error-600 dark:text-error-400">{dispError}</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        {dispLoading ? (
          <p className="p-4 text-sm text-gray-500">Loading…</p>
        ) : savedRows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No disposables configured for this service.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Product</TableCell>
                <TableCell isHeader>Units / service</TableCell>
                <TableCell isHeader>Deduct as</TableCell>
                {canEdit ? <TableCell isHeader className="w-16"> </TableCell> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {savedRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.productCode}</TableCell>
                  <TableCell className="text-sm">{r.productName ?? "—"}</TableCell>
                  <TableCell>{r.unitsPerService}</TableCell>
                  <TableCell>
                    {r.deductionUnitLabel}{" "}
                    {r.stockUnit && <span className="text-xs text-gray-500">(stock {r.stockUnit})</span>}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => removeDisposable(r.id)}
                        className="text-error-600 hover:underline dark:text-error-400"
                        aria-label="Remove"
                      >
                        <TrashBinIcon className="h-4 w-4" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
