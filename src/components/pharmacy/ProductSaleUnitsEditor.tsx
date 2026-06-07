"use client";

import React from "react";
import Label from "@/components/form/Label";
import { pharmacyBaseUnitRowLabel } from "@/lib/pharmacy-base-unit-presets";
import {
  suggestNewAlternateSaleUnitRow,
  validateSaleUnitsPayload,
  type SaleUnitInput,
} from "@/lib/product-sale-units";

/** One row of POS/purchase packaging (maps to {@link ProductSaleUnit}). */
export type ProductSaleUnitRow = {
  unitKey: string;
  label: string;
  baseUnitsEach: number;
};

/** Default single base unit; label follows the product base unit dropdown (pcs → Piece). */
export function defaultProductSaleUnitRows(unitField: string): ProductSaleUnitRow[] {
  const label = pharmacyBaseUnitRowLabel(unitField);
  return [{ unitKey: "base", label, baseUnitsEach: 1 }];
}

/** Sync only the base row’s label when the parent “unit” preset changes (pcs, box, …). */
export function syncBaseSaleUnitLabel(rows: ProductSaleUnitRow[], unitField: string): ProductSaleUnitRow[] {
  const label = pharmacyBaseUnitRowLabel(unitField);
  return rows.map((r) => (r.unitKey === "base" ? { ...r, label } : r));
}

export function saleUnitRowsToPayload(rows: ProductSaleUnitRow[]): SaleUnitInput[] {
  return rows.map((r, i) => ({
    unitKey: r.unitKey,
    label: r.label,
    baseUnitsEach: r.baseUnitsEach,
    sortOrder: i,
  }));
}

export function validateSaleUnitRowsClient(rows: ProductSaleUnitRow[]) {
  return validateSaleUnitsPayload(saleUnitRowsToPayload(rows));
}

type Props = {
  rows: ProductSaleUnitRow[];
  onChange: (rows: ProductSaleUnitRow[]) => void;
  disabled?: boolean;
  /** Shown above the rows */
  className?: string;
};

/** Edit sale/purchase packaging units (base + optional box, strip, …). */
export default function ProductSaleUnitsEditor({ rows, onChange, disabled, className }: Props) {
  function updateRow(idx: number, patch: Partial<ProductSaleUnitRow>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-3"
          >
            <div>
              <Label>Key</Label>
              <input
                value={row.unitKey}
                disabled={disabled || row.unitKey === "base"}
                onChange={(e) => updateRow(idx, { unitKey: e.target.value })}
                onBlur={(e) => updateRow(idx, { unitKey: e.target.value.trim().toLowerCase() })}
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="base, box, strip…"
              />
              {row.unitKey !== "base" ? (
                <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                  Unique ID for POS (lowercase). The label is shown to staff; changing label does not change this key.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Label</Label>
              <input
                value={row.label}
                disabled={disabled}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Shown at POS"
              />
            </div>
            <div>
              <Label>Base units each</Label>
              <input
                type="number"
                min={1}
                value={row.baseUnitsEach}
                disabled={disabled || row.unitKey === "base"}
                onChange={(e) =>
                  updateRow(idx, { baseUnitsEach: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            {row.unitKey !== "base" && !disabled ? (
              <div className="sm:col-span-3">
                <button
                  type="button"
                  className="text-xs text-error-600 hover:underline dark:text-error-400"
                  onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                >
                  Remove packaging
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!disabled ? (
          <button
            type="button"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            onClick={() => onChange([...rows, suggestNewAlternateSaleUnitRow(rows)])}
          >
            + Add alternate unit (e.g. box)
          </button>
        ) : null}
      </div>
    </div>
  );
}
