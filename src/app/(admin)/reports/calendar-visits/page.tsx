"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Branch = { id: number; name: string };

type ReportPayload = {
  range: { from: string; to: string };
  branchId: number | null;
  branchLabel: string | null;
  visitSummary: {
    totalVisits: number;
    byStatus: { status: string; count: number }[];
  };
  visitsByDay: { date: string; count: number }[];
  services: {
    serviceId: number;
    serviceName: string;
    distinctClients: number;
    bookingCount: number;
    serviceLines: number;
  }[];
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#5fb970",
  completed: "#10b981",
  cancelled: "#ef4444",
  "no-show": "#f59e0b",
};

const CHART_BLUE = "#465fff";

function formatStatusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}

export default function CalendarVisitsReportPage() {
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId, seesAllBranches } = useBranchScope();
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
      const res = await authFetch(`/api/reports/appointment-client-stats?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Failed");
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

  const visitsBarOptions: ApexOptions = useMemo(() => {
    const categories = data?.visitsByDay.map((d) => d.date) ?? [];
    return {
      chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
      plotOptions: { bar: { borderRadius: 4, columnWidth: "55%" } },
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        labels: {
          rotate: categories.length > 14 ? -45 : 0,
          rotateAlways: categories.length > 14,
        },
      },
      yaxis: { title: { text: "Bookings" } },
      colors: [CHART_BLUE],
      title: {
        text: "Bookings per day (non-cancelled)",
        align: "left",
        style: { fontSize: "14px", fontWeight: 600 },
      },
      tooltip: { y: { formatter: (v: number) => String(v) } },
    };
  }, [data?.visitsByDay]);

  const visitsBarSeries = useMemo(
    () => [{ name: "Bookings", data: data?.visitsByDay.map((d) => d.count) ?? [] }],
    [data?.visitsByDay]
  );

  const statusDonutOptions: ApexOptions = useMemo(() => {
    const labels = data?.visitSummary.byStatus.map((r) => formatStatusLabel(r.status)) ?? [];
    const series = data?.visitSummary.byStatus.map((r) => r.count) ?? [];
    const total = series.reduce((a, b) => a + b, 0);
    return {
      chart: { type: "donut", toolbar: { show: false }, fontFamily: "inherit" },
      labels,
      colors: labels.map(
        (l) => STATUS_COLORS[l.toLowerCase().replace(/\s/g, "-")] ?? "#64748b"
      ),
      legend: { position: "bottom", horizontalAlign: "center" },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "Total",
                formatter: () => String(total),
              },
            },
          },
        },
      },
      dataLabels: { enabled: true },
      title: {
        text: "Bookings by status",
        align: "left",
        style: { fontSize: "14px", fontWeight: 600 },
      },
      tooltip: {
        y: {
          formatter: (val: number) => {
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
            return `${val} (${pct}%)`;
          },
        },
      },
    };
  }, [data?.visitSummary.byStatus]);

  const servicesHorizontalOptions: ApexOptions = useMemo(() => {
    const rows = data?.services ?? [];
    const top = rows.slice(0, 15);
    const categories = top.map((r) => r.serviceName);
    return {
      chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "70%" } },
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        title: { text: "Distinct clients" },
      },
      yaxis: { labels: { maxWidth: 220 } },
      colors: ["#10b981"],
      title: {
        text: "Top services by distinct clients (up to 15)",
        align: "left",
        style: { fontSize: "14px", fontWeight: 600 },
      },
      tooltip: { y: { formatter: (v: number) => String(v) } },
      grid: { padding: { right: 8 } },
    };
  }, [data?.services]);

  const servicesHorizontalSeries = useMemo(() => {
    const top = (data?.services ?? []).slice(0, 15);
    return [{ name: "Clients", data: top.map((r) => r.distinctClients) }];
  }, [data?.services]);

  if (!hasPermission("appointments.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Calendar visits & services" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  const scopeHint = data?.branchLabel ?? (branchId ? undefined : seesAllBranches ? "All branches" : undefined);

  return (
    <div>
      <PageBreadCrumb pageTitle="Calendar visits & services" />
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Visit volume from the calendar (bookings that are not cancelled) and, for each service, how many distinct
        clients had that service booked in the period. Filter by branch and date range.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        {(seesAllBranches || branches.length > 1) && (
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 min-w-[12rem] rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {seesAllBranches && <option value="">All branches</option>}
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <DateField id="cv-from" label="From" value={from} onChange={setFrom} appendToBody />
        <DateField id="cv-to" label="To" value={to} onChange={setTo} appendToBody />
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
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Visit volume</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Range {data.range.from} → {data.range.to}
              {scopeHint ? ` · ${scopeHint}` : ""}
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3 lg:col-span-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total bookings</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {data.visitSummary.totalVisits.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Cancelled excluded.</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-white/3 lg:col-span-8">
                {data.visitSummary.byStatus.length > 0 ? (
                  <ReactApexChart
                    options={statusDonutOptions}
                    series={data.visitSummary.byStatus.map((r) => r.count)}
                    type="donut"
                    height={280}
                  />
                ) : (
                  <div className="flex h-[280px] items-center justify-center text-sm text-gray-500">No data</div>
                )}
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white px-3 pt-3 dark:border-gray-800 dark:bg-white/3 sm:px-5 sm:pt-5">
              {data.visitsByDay.length > 0 ? (
                <div className="-mx-2 min-w-0 overflow-x-auto pb-2 sm:mx-0">
                  <ReactApexChart options={visitsBarOptions} series={visitsBarSeries} type="bar" height={320} />
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">No bookings in this range.</div>
              )}
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Date</TableCell>
                    <TableCell isHeader className="text-right">
                      Bookings
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.visitsByDay.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-gray-500">
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.visitsByDay.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-mono text-sm">{row.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Clients by service</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Distinct clients with at least one line item for the service on a non-cancelled booking in range.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white px-3 pt-3 dark:border-gray-800 dark:bg-white/3 sm:px-5 sm:pt-5">
              {data.services.length > 0 ? (
                <ReactApexChart
                  options={servicesHorizontalOptions}
                  series={servicesHorizontalSeries}
                  type="bar"
                  height={Math.max(280, 40 + data.services.slice(0, 15).length * 36)}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                  No service lines in this range.
                </div>
              )}
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Service</TableCell>
                    <TableCell isHeader className="text-right">
                      Distinct clients
                    </TableCell>
                    <TableCell isHeader className="text-right">
                      Bookings
                    </TableCell>
                    <TableCell isHeader className="text-right">
                      Line qty
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-gray-500">
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.services.map((row) => (
                      <TableRow key={row.serviceId}>
                        <TableCell>{row.serviceName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.distinctClients}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.bookingCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.serviceLines}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
