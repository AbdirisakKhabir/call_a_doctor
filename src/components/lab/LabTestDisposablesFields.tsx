"use client";

import React, { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { TrashBinIcon } from "@/icons";
import { authFetch } from "@/lib/api";

export type BranchOpt = { id: number; name: string };

export type PendingDisposableRow = {
  clientKey: string;
  productCode: string;
  unitsPerTest: number;
  deductionUnitKey: string;
  productName?: string | null;
};

type LabUnitOpt = { unitKey: string; label: string; baseUnitsEach: number };

type SavedDisposableRow = {
  id: number;
  productCode: string;
  unitsPerTest: number;
  deductionUnitKey: string;
  deductionUnitLabel: string;
  labUnits: LabUnitOpt[];
  productName: string | null;
  stockUnit: string | null;
};

type Props =
  | {
      mode: "pending";
      rows: PendingDisposableRow[];
      onRowsChange: (rows: PendingDisposableRow[]) => void;
      branches: BranchOpt[];
      disposableBranchId: string;
      onDisposableBranchIdChange: (id: string) => void;
    }
  | {
      mode: "saved";
      testId: number;
      canEdit: boolean;
      branches: BranchOpt[];
      disposableBranchId: string;
      onDisposableBranchIdChange: (id: string) => void;
    };

export default function LabTestDisposablesFields(props: Props) {
  const { branches, disposableBranchId, onDisposableBranchIdChange } = props;

  const [newDispCode, setNewDispCode] = useState("");
  const [newDispUnits, setNewDispUnits] = useState("1");
  const [newDeductionUnitKey, setNewDeductionUnitKey] = useState("base");
  const [codeLabUnits, setCodeLabUnits] = useState<LabUnitOpt[]>([]);
  const [dispError, setDispError] = useState("");
  const [productHints, setProductHints] = useState<{ code: string; name: string; unit: string }[]>([]);

  const [savedRows, setSavedRows] = useState<SavedDisposableRow[]>([]);
  const [dispLoading, setDispLoading] = useState(false);

  const loadSaved = useCallback(async (testId: number, branchIdForLookup: string) => {
    setDispLoading(true);
    setDispError("");
    try {
      const q =
        branchIdForLookup && Number(branchIdForLookup) > 0
          ? `?branchId=${encodeURIComponent(branchIdForLookup)}`
          : "";
      const r = await authFetch(`/api/lab/tests/${testId}/disposables${q}`);
      const data = r.ok ? await r.json() : [];
      setSavedRows(Array.isArray(data) ? data : []);
    } finally {
      setDispLoading(false);
    }
  }, []);

  const savedTestId = props.mode === "saved" ? props.testId : null;
  useEffect(() => {
    if (savedTestId == null) return;
    loadSaved(savedTestId, disposableBranchId);
    setNewDispCode("");
    setNewDispUnits("1");
    setNewDeductionUnitKey("base");
    setDispError("");
    setProductHints([]);
    setCodeLabUnits([]);
  }, [savedTestId, disposableBranchId, loadSaved]);

  useEffect(() => {
    const bid = disposableBranchId ? Number(disposableBranchId) : null;
    const q = newDispCode.trim().toUpperCase();
    if (!bid || !Number.isInteger(bid) || q.length < 2) {
      setProductHints([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/pharmacy/products?branchId=${bid}&stockType=all&search=${encodeURIComponent(q)}`)
        .then(async (r) => {
          if (!r.ok) return;
          const raw = await r.json();
          const list = Array.isArray(raw) ? raw : raw?.data;
          if (!Array.isArray(list)) return;
          setProductHints(
            list.slice(0, 8).map((p: { code: string; name: string; unit: string }) => ({
              code: p.code,
              name: p.name,
              unit: p.unit || "",
            }))
          );
        })
        .catch(() => setProductHints([]));
    }, 250);
    return () => clearTimeout(t);
  }, [newDispCode, disposableBranchId]);

  useEffect(() => {
    const bid = disposableBranchId ? Number(disposableBranchId) : null;
    const code = newDispCode.trim().toUpperCase();
    if (!bid || !Number.isInteger(bid) || code.length < 2) {
      setCodeLabUnits([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/lab/inventory/by-code?branchId=${bid}&code=${encodeURIComponent(code)}`)
        .then(async (r) => {
          if (!r.ok) {
            setCodeLabUnits([]);
            return;
          }
          const j = await r.json();
          const u = Array.isArray(j?.packagingOptions) ? j.packagingOptions : j?.item?.labUnits;
          const list: LabUnitOpt[] = Array.isArray(u)
            ? u.map((x: { unitKey: string; label: string; baseUnitsEach: number }) => ({
                unitKey: x.unitKey,
                label: x.label,
                baseUnitsEach: x.baseUnitsEach,
              }))
            : [];
          setCodeLabUnits(list);
          setNewDeductionUnitKey((prev) => {
            const keys = list.map((x) => x.unitKey);
            if (keys.includes(prev)) return prev;
            return keys.includes("base") ? "base" : keys[0] ?? "base";
          });
        })
        .catch(() => setCodeLabUnits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [newDispCode, disposableBranchId]);

  function addPendingRow() {
    if (props.mode !== "pending") return;
    setDispError("");
    const units = Number(newDispUnits);
    const code = newDispCode.trim().toUpperCase();
    if (!code || !Number.isFinite(units) || units <= 0) {
      setDispError("Enter a product code and a positive number of units per test.");
      return;
    }
    if (props.rows.some((r) => r.productCode.toUpperCase() === code)) {
      setDispError("That product code is already on this list.");
      return;
    }
    const hint = productHints.find((h) => h.code.toUpperCase() === code);
    props.onRowsChange([
      ...props.rows,
      {
        clientKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        productCode: code,
        unitsPerTest: units,
        deductionUnitKey: newDeductionUnitKey,
        productName: hint?.name ?? null,
      },
    ]);
    setNewDispCode("");
    setNewDispUnits("1");
    setNewDeductionUnitKey("base");
    setProductHints([]);
    setCodeLabUnits([]);
  }

  async function addSavedRow() {
    if (props.mode !== "saved" || !props.canEdit) return;
    setDispError("");
    const units = Number(newDispUnits);
    if (!newDispCode.trim() || !Number.isFinite(units) || units <= 0) {
      setDispError("Enter a product code and a positive number of units per test.");
      return;
    }
    const branchId = Number(disposableBranchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      setDispError("Select a branch before adding disposables.");
      return;
    }
    const res = await authFetch(`/api/lab/tests/${props.testId}/disposables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: newDispCode.trim(),
        unitsPerTest: units,
        deductionUnitKey: newDeductionUnitKey,
        branchId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDispError(data.error || "Failed to add");
      return;
    }
    setNewDispCode("");
    setNewDispUnits("1");
    setNewDeductionUnitKey("base");
    setCodeLabUnits([]);
    await loadSaved(props.testId, disposableBranchId);
  }

  async function patchSavedDisposable(
    disposableId: number,
    patch: { deductionUnitKey?: string; unitsPerTest?: number }
  ) {
    if (props.mode !== "saved" || !props.canEdit) return;
    const body: Record<string, unknown> = { ...patch };
    if (patch.deductionUnitKey !== undefined) {
      const branchId = Number(disposableBranchId);
      if (!Number.isInteger(branchId) || branchId <= 0) {
        setDispError("Select a branch before changing the deduction unit.");
        return;
      }
      body.branchId = branchId;
    }
    const res = await authFetch(`/api/lab/tests/${props.testId}/disposables/${disposableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) await loadSaved(props.testId, disposableBranchId);
    else setDispError((await res.json()).error || "Failed to update");
  }

  async function removeSaved(did: number) {
    if (props.mode !== "saved" || !props.canEdit || !confirm("Remove this disposable?")) return;
    const res = await authFetch(`/api/lab/tests/${props.testId}/disposables/${did}`, { method: "DELETE" });
    if (res.ok) await loadSaved(props.testId, disposableBranchId);
    else setDispError((await res.json()).error || "Failed");
  }

  function removePending(clientKey: string) {
    if (props.mode !== "pending") return;
    props.onRowsChange(props.rows.filter((r) => r.clientKey !== clientKey));
  }

  const showForm = props.mode === "pending" || (props.mode === "saved" && props.canEdit);

  function onAddRowKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    if (props.mode === "pending") addPendingRow();
    else void addSavedRow();
  }

  const disposableCount =
    props.mode === "pending" ? props.rows.length : savedRows.length;

  const unitSelectOptions =
    codeLabUnits.length > 0
      ? codeLabUnits
      : [{ unitKey: "base", label: "base (configure in Lab inventory)", baseUnitsEach: 1 }];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Test disposables
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">· multiple per test</span>
        </h2>
        {disposableCount > 0 ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {disposableCount} item{disposableCount === 1 ? "" : "s"} assigned
          </p>
        ) : null}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Stock is tracked in <strong className="font-medium text-gray-600 dark:text-gray-300">base</strong> units on the
          lab line. Choose which packaging unit this line deducts (e.g. pairs vs pcs) when that unit is set up under
          Laboratory → Lab inventory → packaging units.
        </p>
      </div>

      {dispError && (
        <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {dispError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Branch (pharmacy inventory lookup)</Label>
          <select
            value={disposableBranchId}
            onChange={(e) => onDisposableBranchIdChange(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showForm && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <Label>Product code</Label>
            <input
              value={newDispCode}
              onChange={(e) => setNewDispCode(e.target.value)}
              onKeyDown={onAddRowKeyDown}
              placeholder="e.g. GLV-001"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              autoComplete="off"
            />
            {productHints.length > 0 && (
              <ul className="mt-1 max-h-28 overflow-y-auto rounded border border-gray-100 text-xs dark:border-gray-700">
                {productHints.map((h) => (
                  <li key={h.code}>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => {
                        setNewDispCode(h.code);
                        setProductHints([]);
                      }}
                    >
                      <span className="font-mono">{h.code}</span> — {h.name}
                      {h.unit ? ` (${h.unit})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="w-36 min-w-[8rem]">
            <Label>Deduct in</Label>
            <select
              value={newDeductionUnitKey}
              onChange={(e) => setNewDeductionUnitKey(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {unitSelectOptions.map((u) => (
                <option key={u.unitKey} value={u.unitKey}>
                  {u.label} ({u.unitKey})
                </option>
              ))}
            </select>
          </div>
          <div className="w-32">
            <Label>Units / test</Label>
            <input
              type="number"
              min="0.01"
              step="any"
              value={newDispUnits}
              onChange={(e) => setNewDispUnits(e.target.value)}
              onKeyDown={onAddRowKeyDown}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={dispLoading && props.mode === "saved"}
            onClick={() => {
              if (props.mode === "pending") addPendingRow();
              else void addSavedRow();
            }}
          >
            {disposableCount > 0 ? "Add another disposable" : "Add disposable"}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {props.mode === "pending" ? (
          props.rows.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No disposables yet — stock will not change when results are saved.</p>
          ) : (
            <div className="max-h-[min(70vh,28rem)] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader>Product</TableCell>
                    <TableCell isHeader>Deduct in</TableCell>
                    <TableCell isHeader className="text-right">Units / test</TableCell>
                    <TableCell isHeader> </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {props.rows.map((d) => (
                    <TableRow key={d.clientKey}>
                      <TableCell className="font-mono text-xs">{d.productCode}</TableCell>
                      <TableCell className="text-sm">{d.productName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{d.deductionUnitKey}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.unitsPerTest}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removePending(d.clientKey)}
                          className="text-error-500 hover:underline"
                          aria-label="Remove"
                        >
                          <TrashBinIcon className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : dispLoading ? (
          <p className="p-4 text-sm text-gray-500">Loading disposables…</p>
        ) : savedRows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No disposables — stock will not change when results are saved.</p>
        ) : (
          <div className="max-h-[min(70vh,28rem)] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Code</TableCell>
                  <TableCell isHeader>Product</TableCell>
                  <TableCell isHeader>Deduct in</TableCell>
                  <TableCell isHeader>Base unit</TableCell>
                  <TableCell isHeader className="text-right">Units / test</TableCell>
                  <TableCell isHeader> </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedRows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.productCode}</TableCell>
                    <TableCell className="text-sm">{d.productName ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {props.canEdit && d.labUnits.length > 0 ? (
                        <select
                          value={d.deductionUnitKey}
                          onChange={(e) => patchSavedDisposable(d.id, { deductionUnitKey: e.target.value })}
                          className="max-w-[10rem] rounded border border-gray-200 bg-transparent px-2 py-1 text-xs dark:border-gray-600"
                        >
                          {d.labUnits.map((u) => (
                            <option key={u.unitKey} value={u.unitKey}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        d.deductionUnitLabel
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.stockUnit ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {props.canEdit ? (
                        <input
                          key={`upt-${d.id}-${d.unitsPerTest}`}
                          type="number"
                          min="0.01"
                          step="any"
                          defaultValue={d.unitsPerTest}
                          className="w-20 rounded border border-gray-200 bg-transparent px-2 py-1 text-right text-sm dark:border-gray-600"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v <= 0) return;
                            if (v !== d.unitsPerTest) patchSavedDisposable(d.id, { unitsPerTest: v });
                          }}
                        />
                      ) : (
                        d.unitsPerTest
                      )}
                    </TableCell>
                    <TableCell>
                      {props.canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeSaved(d.id)}
                          className="text-error-500 hover:underline"
                          aria-label="Remove"
                        >
                          <TrashBinIcon className="size-4" />
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
