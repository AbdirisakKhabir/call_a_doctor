"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

type Branch = { id: number; name: string };

type ReportPayload = {
  range: { from: string; to: string };
  branchId: number | null;
  totalTestsCompleted: number;
  tests: {
    labTestId: number;
    testName: string;
    testCode: string | null;
    completedCount: number;
  }[];
  disposables: {
    code: string;
    name: string;
    unit: string;
    totalOut: number;
  }[];
};

export default function LabConsumeReportPage() {
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId, seesAllBranches, hasMultipleAssignedBranches } = useBranchScope();
  const canView =
    hasPermission("lab.view") ||
    hasPermission("financial.view") ||
    hasPermission("accounts.reports");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ReportPayload | null>(null);

  useEffect(() => {
    if (!canView) return;
    authFetch(hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, [canView, hasPermission]);

  useEffect(() => {
    if (singleAssignedBranchId && !branchId) setBranchId(String(singleAssignedBranchId));
    else if (seesAllBranches && !branchId) setBranchId("");
    else if (!seesAllBranches && branches.length === 1 && !branchId) setBranchId(String(branches[0].id));
  }, [singleAssignedBranchId, seesAllBranches, branches, branchId]);

  const run = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (branchId) params.set("branchId", branchId);
      const res = await authFetch(`/api/reports/lab-consume?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed");
        setData(null);
        return;
      }
      setData(j as ReportPayload);
    } catch {
      setError("Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, canView]);

  useEffect(() => {
    if (!canView) return;
    void run();
  }, [canView, run]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab consume report" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  const showBranchFilter = seesAllBranches || hasMultipleAssignedBranches;

  return (
    <div>
      <PageBreadCrumb pageTitle="Lab consume report" />
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        For a selected period: <strong>completed</strong> lab test lines (by test type) and lab inventory deducted as{" "}
        <strong>test disposables</strong> (stock movements). Scoped to the appointment branch of each order.
      </p>

      <div className="no-print mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        {showBranchFilter && (
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 min-w-48 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">All allowed branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <DateField id="lab-consume-from" label="From" value={from} onChange={setFrom} appendToBody />
        <DateField id="lab-consume-to" label="To" value={to} onChange={setTo} appendToBody />
        <button
          type="button"
          onClick={() => void run()}
          className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="mt-10 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : data ? (
        <div className="mt-8 space-y-10">
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Test lines completed
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                  {data.totalTestsCompleted}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Completion time uses recorded → disposable → created timestamp.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Disposable SKU types
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
                  {data.disposables.length}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">Distinct lab inventory items with usage in range</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Tests completed</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One row per lab test; count is completed lines in the period.</p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Test</TableCell>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader className="text-right">
                      Completed
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-gray-500">
                        No completed lab lines in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.tests.map((t) => (
                      <TableRow key={t.labTestId}>
                        <TableCell className="font-medium">{t.testName}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {t.testCode ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.completedCount}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Lab disposables consumed</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Stock movements with reason <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">disposable</code> in
              the selected range (lab inventory, base units).
            </p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader>Item</TableCell>
                    <TableCell isHeader className="text-right">
                      Qty out
                    </TableCell>
                    <TableCell isHeader>Unit</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.disposables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-gray-500">
                        No disposable deductions in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.disposables.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalOut}</TableCell>
                        <TableCell>{r.unit}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
