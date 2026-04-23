"use client";

import React, { useMemo } from "react";
import ProductSaleUnitsEditor, { type ProductSaleUnitRow } from "@/components/pharmacy/ProductSaleUnitsEditor";
import { buildUnitConversionSummary } from "@/lib/product-unit-conversion";

type Props = {
  rows: ProductSaleUnitRow[];
  onChange: (rows: ProductSaleUnitRow[]) => void;
  disabled?: boolean;
  className?: string;
};

export default function ProductUnitConversionPanel({ rows, onChange, disabled, className }: Props) {
  const summary = useMemo(() => buildUnitConversionSummary(rows), [rows]);

  return (
    <div className={className}>
      {summary ? (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-xs dark:border-gray-600 dark:bg-gray-900/50">
          <p className="text-gray-700 dark:text-gray-300">{summary.intro}</p>
          <p className="mt-2 border-t border-gray-100 pt-2 text-gray-600 dark:border-gray-700 dark:text-gray-400">
            Example: gloves sold by the pair, bought in boxes of 150 pairs — use key <span className="font-mono">base</span>{" "}
            labeled <strong>Pair</strong>, then add key <span className="font-mono">box</span> with{" "}
            <strong>Base units each 150</strong>. Three boxes received → quantity <strong>450</strong> (pairs). Do not
            label the base row &quot;Box&quot; if you also sell by the pair.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-gray-600 dark:text-gray-400">
            {summary.toBase.map((row, i) => (
              <li key={i}>
                <span className="font-medium text-gray-800 dark:text-gray-200">1 {row.unitLabel}</span>
                <span className="font-mono text-[0.7rem] text-gray-500"> ({row.unitKey})</span>
                {" = "}
                <span className="font-medium">{row.baseUnitsEach}</span> {row.baseLabel}
                {row.baseUnitsEach === 1 ? " (base step)" : ""}
              </li>
            ))}
            {summary.pairwise.map((line, i) => (
              <li key={`pair-${i}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ProductSaleUnitsEditor rows={rows} onChange={onChange} disabled={disabled} />
    </div>
  );
}
