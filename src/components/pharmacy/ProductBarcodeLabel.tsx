"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  /** Barcode value (same as product code). */
  value: string;
  className?: string;
};

/**
 * Renders a scannable CODE128 barcode (SVG). Use the same value printed on labels / stored in inventory.
 */
export default function ProductBarcodeLabel({ value, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !value.trim()) return;
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      JsBarcode(el, value.trim(), {
        format: "CODE128",
        width: 2,
        height: 44,
        displayValue: true,
        fontSize: 12,
        margin: 8,
        background: "transparent",
      });
    } catch {
      /* invalid for CODE128 — leave empty */
    }
  }, [value]);

  if (!value.trim()) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Enter a barcode to preview.</p>;
  }

  return (
    <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40 ${className ?? ""}`}>
      <svg ref={svgRef} className="mx-auto block max-h-28 min-h-[3rem] w-full min-w-[8rem]" aria-hidden />
      <p className="mt-2 text-center text-[10px] text-gray-500 dark:text-gray-400">Scan at POS — CODE128</p>
    </div>
  );
}
