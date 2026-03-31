"use client";

import React from "react";
import DateField from "./DateField";

type DateRangeFilterProps = {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear?: () => void;
  fromLabel?: string;
  toLabel?: string;
  clearLabel?: string;
  /** Optional: constrain "to" to be after "from" */
  enforceOrder?: boolean;
};

/**
 * From / To date range using calendar pickers (Flatpickr).
 */
export default function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  fromLabel = "From",
  toLabel = "To",
  clearLabel = "Clear dates",
  enforceOrder = true,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[160px]">
        <DateField
          label={fromLabel}
          value={from}
          onChange={onFromChange}
          max={enforceOrder && to ? to : undefined}
          appendToBody
        />
      </div>
      <div className="min-w-[160px]">
        <DateField
          label={toLabel}
          value={to}
          onChange={onToChange}
          min={enforceOrder && from ? from : undefined}
          appendToBody
        />
      </div>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}
