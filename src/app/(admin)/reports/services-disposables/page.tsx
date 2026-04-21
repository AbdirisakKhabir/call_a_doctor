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
  completedAppointmentCount: number;
  services: {
    serviceId: number;
    serviceName: string;
    quantityProvided: number;
    revenue: number;
  }[];
  disposables: {
    productId: number;
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    costTotal: number;
    sellingValue: number;
  }[];
  totals: {
    serviceRevenue: number;
    disposablesCost: number;
    disposablesSellingValue: number;
  };
};

export default function ServicesDisposablesReportPage() {
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId, seesAllBranches, hasMultipleAssignedBranches } = useBranchScope();
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
    authFetch(hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, [hasPermission]);

  useEffect(() => {
    if (singleAssignedBranchId && !branchId) setBranchId(String(singleAssignedBranchId));
    else if (seesAllBranches && !branchId) setBranchId("");
    else if (!seesAllBranches && branches.length === 1 && !branchId) setBranchId(String(branches[0].id));
  }, [singleAssignedBranchId, seesAllBranches, branches, branchId]);

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (branchId) params.set("branchId", branchId);
      const res = await authFetch(`/api/reports/services-disposables?${params.toString()}`);
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
  }, [from, to, branchId]);

  useEffect(() => {
    void run();
  }, [run]);

  if (!hasPermission("appointments.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Services & disposables" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  const showBranchFilter = seesAllBranches || hasMultipleAssignedBranches;

  return (
    <div>
      <PageBreadCrumb pageTitle="Services & disposables" />
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Completed appointments in the period: service quantities and revenue, plus pharmacy stock removed for service
        disposables (cost and retail value use current product cost / selling price).
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        {showBranchFilter && (
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 min-w-[12rem] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
        <DateField id="svc-from" label="From" value={from} onChange={setFrom} appendToBody />
        <DateField id="svc-to" label="To" value={to} onChange={setTo} appendToBody />
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
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">{data.completedAppointmentCount}</span>{" "}
              completed appointment(s) in range
              {data.branchId != null && (
                <span className="ml-2 font-mono text-xs">(branch filter #{data.branchId})</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-6 text-sm">
              <span>
                Service revenue:{" "}
                <strong className="tabular-nums">${data.totals.serviceRevenue.toFixed(2)}</strong>
              </span>
              <span>
                Disposables (cost):{" "}
                <strong className="tabular-nums">${data.totals.disposablesCost.toFixed(2)}</strong>
              </span>
              <span>
                Disposables (retail value):{" "}
                <strong className="tabular-nums">${data.totals.disposablesSellingValue.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Services delivered</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Service</TableCell>
                    <TableCell isHeader className="text-right">
                      Quantity (lines)
                    </TableCell>
                    <TableCell isHeader className="text-right">
                      Revenue
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-gray-500">
                        No completed services in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.services.map((s) => (
                      <TableRow key={s.serviceId}>
                        <TableCell>{s.serviceName}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.quantityProvided}</TableCell>
                        <TableCell className="text-right tabular-nums">${s.revenue.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Disposables used (pharmacy)</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              From internal stock movements when appointments were marked completed (purpose: service disposable).
            </p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Product</TableCell>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader className="text-right">
                      Qty (base)
                    </TableCell>
                    <TableCell isHeader className="text-right">
                      Cost total
                    </TableCell>
                    <TableCell isHeader className="text-right">
                      Retail value
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.disposables.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-gray-500">
                        No disposables logged in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.disposables.map((d) => (
                      <TableRow key={d.productId}>
                        <TableCell>{d.productName}</TableCell>
                        <TableCell className="font-mono text-xs">{d.productCode}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.quantity} {d.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">${d.costTotal.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">${d.sellingValue.toFixed(2)}</TableCell>
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
