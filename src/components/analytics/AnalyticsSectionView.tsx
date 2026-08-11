"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { getAnalyticsSection, type AnalyticsSectionKey } from "@/lib/analytics/sections";
import type { AnalyticsReport } from "@/lib/analytics/types";
import AiInsightPanel from "./AiInsightPanel";
import AnalyticsChartCard from "./AnalyticsChartCard";
import AnalyticsKpiGrid from "./AnalyticsKpiGrid";
import AnalyticsTableCard from "./AnalyticsTableCard";
import { formatIsoDateLabel } from "./format";

type Branch = { id: number; name: string };

type RangePreset = { key: string; label: string; resolve: () => { from: string; to: string } };

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const RANGE_PRESETS: RangePreset[] = [
  {
    key: "last7",
    label: "Last 7 days",
    resolve: () => ({ from: isoOf(shiftDays(-6)), to: isoOf(new Date()) }),
  },
  {
    key: "last30",
    label: "Last 30 days",
    resolve: () => ({ from: isoOf(shiftDays(-29)), to: isoOf(new Date()) }),
  },
  {
    key: "thisMonth",
    label: "This month",
    resolve: () => {
      const now = new Date();
      return { from: isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoOf(now) };
    },
  },
  {
    key: "lastMonth",
    label: "Last month",
    resolve: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoOf(start), to: isoOf(end) };
    },
  },
  {
    key: "thisYear",
    label: "This year",
    resolve: () => {
      const now = new Date();
      return { from: isoOf(new Date(now.getFullYear(), 0, 1)), to: isoOf(now) };
    },
  },
];

export default function AnalyticsSectionView({ sectionKey }: { sectionKey: AnalyticsSectionKey }) {
  const section = getAnalyticsSection(sectionKey);
  const { hasPermission } = useAuth();
  const { seesAllBranches, singleAssignedBranchId } = useBranchScope();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchOverride, setBranchOverride] = useState<string | null>(null);
  const [from, setFrom] = useState(() => RANGE_PRESETS[2]!.resolve().from);
  const [to, setTo] = useState(() => RANGE_PRESETS[2]!.resolve().to);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canView = useMemo(
    () => Boolean(section && hasPermission(section.permission)),
    [hasPermission, section]
  );

  useEffect(() => {
    if (!canView) return;
    authFetch(hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches")
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body.data ?? []);
        if (Array.isArray(list)) setBranches(list as Branch[]);
      })
      .catch(() => {});
  }, [canView, hasPermission]);

  /** Users tied to a single branch should never see an "All branches" total they cannot access. */
  const defaultBranchId = useMemo(() => {
    if (singleAssignedBranchId) return String(singleAssignedBranchId);
    if (!seesAllBranches && branches.length === 1) return String(branches[0]!.id);
    return "";
  }, [branches, seesAllBranches, singleAssignedBranchId]);

  const branchId = branchOverride ?? defaultBranchId;

  const run = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (branchId) params.set("branchId", branchId);
      const res = await authFetch(`/api/analytics/${sectionKey}?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Failed to load this report.");
        setReport(null);
        return;
      }
      setReport(body as AnalyticsReport);
    } catch {
      setError("Failed to load this report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [branchId, canView, from, sectionKey, to]);

  useEffect(() => {
    void run();
  }, [run]);

  const activePreset = useMemo(
    () => RANGE_PRESETS.find((preset) => {
      const resolved = preset.resolve();
      return resolved.from === from && resolved.to === to;
    })?.key,
    [from, to]
  );

  if (!section) return null;

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle={section.title} />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          You do not have permission to view this report.
        </p>
      </div>
    );
  }

  const showBranchPicker = seesAllBranches || branches.length > 1;

  return (
    <div>
      <PageBreadCrumb pageTitle={section.title} />
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{section.description}</p>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-wrap items-end gap-4">
          {showBranchPicker ? (
            <div>
              <Label>Branch</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchOverride(e.target.value)}
                className="mt-1 h-11 min-w-[12rem] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {seesAllBranches ? <option value="">All branches</option> : null}
                {branches.map((branch) => (
                  <option key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <DateField id={`analytics-${sectionKey}-from`} label="From" value={from} onChange={setFrom} appendToBody />
          <DateField id={`analytics-${sectionKey}-to`} label="To" value={to} onChange={setTo} appendToBody />
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
          >
            Print
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                const resolved = preset.resolve();
                setFrom(resolved.from);
                setTo(resolved.to);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activePreset === preset.key
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : null}

      {loading && !report ? (
        <div className="mt-16 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : null}

      {report ? (
        <div className="mt-8 space-y-8">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {formatIsoDateLabel(report.range.from)} → {formatIsoDateLabel(report.range.to)} · {report.branchLabel}
            </p>
            {report.notes.length > 0 ? (
              <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5 text-xs text-gray-500 dark:text-gray-400">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <AnalyticsKpiGrid kpis={report.kpis} />

          <AiInsightPanel
            sectionKey={sectionKey}
            from={report.range.from}
            to={report.range.to}
            branchId={branchId}
            reportReady={!loading}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {report.charts.map((chart) => (
              <AnalyticsChartCard key={chart.key} chart={chart} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {report.tables.map((table) => (
              <AnalyticsTableCard key={table.key} table={table} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
