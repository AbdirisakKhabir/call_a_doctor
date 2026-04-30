"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string };

type BreakdownRow = {
  key: string;
  label: string;
  orderCount: number;
  totalFees: number;
  totalPaid: number;
  totalDiscount: number;
  totalOutstanding: number;
};

type ReportData = {
  groupBy: string;
  filters: { from: string | null; to: string | null; branchId: string | null; doctorId: string | null; status: string | null };
  summary: {
    orderCount: number;
    totalFees: number;
    totalPaid: number;
    totalDiscount: number;
    totalOutstanding: number;
  };
  breakdown: BreakdownRow[];
};

export default function FinanceLabSalesReportPage() {
  const { hasPermission } = useAuth();
  const canView =
    hasPermission("financial.view") || hasPermission("accounts.reports") || hasPermission("lab.view");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [status, setStatus] = useState("all");
  const [groupBy, setGroupBy] = useState("none");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/branches")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Branch[]) => {
        if (!cancelled) setBranches(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q =
      branchId.trim() && Number.isInteger(Number(branchId)) && Number(branchId) > 0
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";
    authFetch(`/api/doctors${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Doctor[]) => {
        if (!cancelled) setDoctors(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    if (doctorId) params.set("doctorId", doctorId);
    if (status !== "all") params.set("status", status);
    if (groupBy !== "none") params.set("groupBy", groupBy);

    const res = await authFetch(`/api/finance/lab-sales-report?${params}`);
    if (res.ok) setData(await res.json());
    else setData(null);
    setLoading(false);
  }, [from, to, branchId, doctorId, status, groupBy]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab sales report" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageBreadCrumb pageTitle="Lab sales report" />
        <Link href="/finance/lab-sales" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Lab sales list
        </Link>
      </div>

      <div className="mb-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => {
            setFrom("");
            setTo("");
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setDoctorId("");
              }}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Doctor</Label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label>Group by</Label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="none">Totals only</option>
              <option value="branch">Branch</option>
              <option value="doctor">Doctor</option>
              <option value="day">Day (request date)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : !data ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500">Could not load report.</div>
        ) : (
          <div className="space-y-8 p-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Summary</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Lab fees from test requests in the selected period and filters.
              </p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Requests</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    {data.summary.orderCount}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Total fees</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    ${data.summary.totalFees.toFixed(2)}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Collected</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    ${data.summary.totalPaid.toFixed(2)}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Write-offs</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    ${data.summary.totalDiscount.toFixed(2)}
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Outstanding</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                    ${data.summary.totalOutstanding.toFixed(2)}
                  </dd>
                </div>
              </dl>
            </div>

            {data.breakdown.length > 0 ? (
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Breakdown</h3>
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3">{data.groupBy === "day" ? "Date" : "Name"}</th>
                        <th className="px-4 py-3 text-right">Requests</th>
                        <th className="px-4 py-3 text-right">Fees</th>
                        <th className="px-4 py-3 text-right">Collected</th>
                        <th className="px-4 py-3 text-right">Write-offs</th>
                        <th className="px-4 py-3 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {data.breakdown.map((r) => (
                        <tr key={r.key} className="hover:bg-gray-50/80 dark:hover:bg-white/5">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.label}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.orderCount}</td>
                          <td className="px-4 py-3 text-right tabular-nums">${r.totalFees.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">${r.totalPaid.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">${r.totalDiscount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            ${r.totalOutstanding.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
