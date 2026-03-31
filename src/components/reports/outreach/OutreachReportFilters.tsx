"use client";

import React from "react";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import Button from "@/components/ui/button/Button";
import { useOutreachReport } from "./OutreachReportsProvider";

export function OutreachReportFilters() {
  const {
    branches,
    branchId,
    setBranchId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    teamId,
    setTeamId,
    teams,
    loading,
    error,
    refetch,
    data,
  } = useOutreachReport();

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900/30">
        {data?.branch ? (
          <p className="mb-4 text-sm font-medium text-gray-800 dark:text-gray-200">
            Location: <span className="text-brand-700 dark:text-brand-300">{data.branch.name}</span>
            {data.branch.phone ? (
              <span className="font-normal text-gray-500 dark:text-gray-500"> · {data.branch.phone}</span>
            ) : null}
          </p>
        ) : null}

        <div
          className={`flex flex-wrap items-end gap-4 ${data?.branch ? "border-t border-gray-200 pt-5 dark:border-gray-700" : ""}`}
        >
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1.5 h-11 min-w-[200px] rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <DateField
            label="Start date"
            value={dateFrom}
            onChange={(v) => {
              setDateFrom(v);
              if (v && dateTo && v > dateTo) setDateTo(v);
            }}
            max={dateTo || undefined}
            appendToBody
          />
          <DateField
            label="End date"
            value={dateTo}
            onChange={(v) => {
              setDateTo(v);
              if (v && dateFrom && v < dateFrom) setDateFrom(v);
            }}
            min={dateFrom || undefined}
            appendToBody
          />
          <div>
            <Label>Team filter</Label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="mt-1.5 h-11 min-w-[200px] rounded-xl border border-gray-200 bg-white px-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="">All outreach teams</option>
              {teams.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" className="h-11" onClick={() => refetch()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh data"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-error-200 bg-error-50/90 px-4 py-3 text-sm text-error-800 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
