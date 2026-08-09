"use client";

import React from "react";
import type { AnalyticsKpi } from "@/lib/analytics/types";
import { formatAnalyticsValue } from "./format";

function ChangeBadge({ change }: { change: number }) {
  const positive = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        positive
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
          : "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
      }`}
      title="Compared with the previous period of the same length"
    >
      {positive ? "▲" : "▼"} {Math.abs(change).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export default function AnalyticsKpiGrid({ kpis }: { kpis: AnalyticsKpi[] }) {
  if (kpis.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.key}
          className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</p>
            {kpi.changePercent != null ? <ChangeBadge change={kpi.changePercent} /> : null}
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {formatAnalyticsValue(kpi.value, kpi.format)}
          </p>
          {kpi.hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{kpi.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
