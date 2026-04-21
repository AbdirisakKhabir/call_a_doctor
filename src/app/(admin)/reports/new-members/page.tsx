"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import * as XLSX from "xlsx";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type BranchOpt = { id: number; name: string };
type CityOpt = { id: number; name: string };
type VillageOpt = { id: number; name: string };

type RowWithPct = { count: number; percent: number };

type ReportPayload = {
  branch: { id: number; name: string };
  from: string;
  to: string;
  ageFilter: { min: number | null; max: number | null };
  locationFilter: {
    cityId: number | null;
    cityName: string | null;
    villageId: number | null;
    villageName: string | null;
  };
  totalNewMembers: number;
  summary: {
    total: number;
    withPhone: number;
    withEmail: number;
    withCityAndVillage: number;
    withPhonePercent: number;
    withEmailPercent: number;
    withCityAndVillagePercent: number;
  };
  byCity: (RowWithPct & { cityId: number; cityName: string })[];
  byVillage: (RowWithPct & {
    villageId: number;
    villageName: string;
    cityId: number | null;
    cityName: string;
  })[];
  byGender: (RowWithPct & { label: string })[];
  byReferralSource: (RowWithPct & { referralSourceId: number | null; name: string })[];
  byAgeGroup: (RowWithPct & { label: string })[];
  byMonth: { month: string; label: string; count: number }[];
  detail: {
    patientCode: string;
    firstName: string;
    lastName: string;
    gender: string;
    phone: string;
    email: string;
    city: string;
    village: string;
    address: string;
    referralSource: string;
    ageYears: number | null;
    ageGroup: string;
    registeredAt: string;
  }[];
  detailTruncated: boolean;
  detailTotal: number;
};

const CHART_COLORS = [
  "#465fff",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#64748b",
];

function topNForChart(
  rows: { name: string; count: number }[],
  n: number
): { labels: string[]; series: number[] } {
  if (rows.length <= n) {
    return {
      labels: rows.map((r) => r.name),
      series: rows.map((r) => r.count),
    };
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, r) => s + r.count, 0);
  const labels = top.map((r) => r.name);
  const series = top.map((r) => r.count);
  if (rest > 0) {
    labels.push("Other");
    series.push(rest);
  }
  return { labels, series };
}

function donutOptions(labels: string[], series: number[], title: string): ApexOptions {
  const total = series.reduce((a, b) => a + b, 0);
  return {
    chart: {
      fontFamily: "inherit",
      type: "donut",
      toolbar: { show: false },
    },
    labels,
    colors: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
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
    title: { text: title, align: "left", style: { fontSize: "14px", fontWeight: 600 } },
    tooltip: {
      y: {
        formatter: (val: number) => {
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
          return `${val} (${pct}%)`;
        },
      },
    },
  };
}

function barOptions(categories: string[], title: string): ApexOptions {
  return {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
    },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "55%" } },
    dataLabels: { enabled: false },
    xaxis: { categories },
    yaxis: { title: { text: "Registrations" } },
    colors: ["#465fff"],
    title: { text: title, align: "left", style: { fontSize: "14px", fontWeight: 600 } },
    tooltip: { y: { formatter: (v: number) => String(v) } },
  };
}

export default function ClientRegistrationReportPage() {
  const { hasPermission, user, isLoading: authLoading } = useAuth();
  const canView = hasPermission("patients.view");
  const canAllBranches = hasPermission("settings.manage");

  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [filterCityId, setFilterCityId] = useState("");
  const [filterVillageId, setFilterVillageId] = useState("");
  const [cities, setCities] = useState<CityOpt[]>([]);
  const [villages, setVillages] = useState<VillageOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ReportPayload | null>(null);

  useEffect(() => {
    if (authLoading) return;
    const url = canAllBranches ? "/api/branches?all=true" : "/api/branches";
    authFetch(url)
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        setBranches(list);
      })
      .catch(() => {});
  }, [canAllBranches, authLoading, user?.id]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/cities")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setCities(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cid = filterCityId ? Number(filterCityId) : null;
    if (!cid || !Number.isInteger(cid)) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    authFetch(`/api/villages?cityId=${cid}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setVillages(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filterCityId]);

  async function runReport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!branchId) {
      setError("Registration branch is required");
      return;
    }
    const aminRaw = ageMin.trim();
    const amaxRaw = ageMax.trim();
    if (aminRaw || amaxRaw) {
      const amin = aminRaw ? Number(aminRaw) : NaN;
      const amax = amaxRaw ? Number(amaxRaw) : NaN;
      if (aminRaw && (!Number.isInteger(amin) || amin < 0 || amin > 130)) {
        setError("Minimum age must be a whole number from 0 to 130");
        return;
      }
      if (amaxRaw && (!Number.isInteger(amax) || amax < 0 || amax > 130)) {
        setError("Maximum age must be a whole number from 0 to 130");
        return;
      }
      if (Number.isInteger(amin) && Number.isInteger(amax) && amin > amax) {
        setError("Minimum age cannot be greater than maximum age");
        return;
      }
    }
    setLoading(true);
    setData(null);
    try {
      const params = new URLSearchParams({
        branchId,
        from,
        to,
      });
      if (aminRaw) params.set("ageMin", aminRaw);
      if (amaxRaw) params.set("ageMax", amaxRaw);
      if (filterCityId) params.set("cityId", filterCityId);
      if (filterVillageId) params.set("villageId", filterVillageId);
      const res = await authFetch(`/api/reports/new-members-by-location?${params}`);
      const body = (await res.json()) as ReportPayload & { error?: string };
      if (!res.ok) {
        setError(body.error || "Failed to load report");
        return;
      }
      setData(body as ReportPayload);
    } finally {
      setLoading(false);
    }
  }

  const exportExcel = useCallback(() => {
    if (!data) return;
    const safeName = data.branch.name.replace(/[^\w\-]+/g, "-").slice(0, 40);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Metric: "Branch", Value: data.branch.name },
        { Metric: "Period from", Value: data.from },
        { Metric: "Period to", Value: data.to },
        {
          Metric: "Age range filter",
          Value:
            data.ageFilter.min != null || data.ageFilter.max != null
              ? `${data.ageFilter.min ?? "—"} to ${data.ageFilter.max ?? "—"} (years; unknown age excluded)`
              : "All ages",
        },
        {
          Metric: "City / village filter",
          Value:
            data.locationFilter.villageId != null
              ? `${data.locationFilter.cityName ?? "—"} — ${data.locationFilter.villageName ?? "—"}`
              : data.locationFilter.cityId != null
                ? data.locationFilter.cityName ?? "—"
                : "All",
        },
        { Metric: "Total new members", Value: data.totalNewMembers },
        { Metric: "With phone", Value: `${data.summary.withPhone} (${data.summary.withPhonePercent}%)` },
        { Metric: "With email", Value: `${data.summary.withEmail} (${data.summary.withEmailPercent}%)` },
        {
          Metric: "With city & village",
          Value: `${data.summary.withCityAndVillage} (${data.summary.withCityAndVillagePercent}%)`,
        },
      ]),
      "Summary"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byCity.map((r) => ({
          City: r.cityName,
          Count: r.count,
          Percent: `${r.percent}%`,
        }))
      ),
      "By city"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byVillage.map((r) => ({
          City: r.cityName,
          Village: r.villageName,
          Count: r.count,
          Percent: `${r.percent}%`,
        }))
      ),
      "By village"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byGender.map((r) => ({
          Gender: r.label,
          Count: r.count,
          Percent: `${r.percent}%`,
        }))
      ),
      "By gender"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byReferralSource.map((r) => ({
          Referral: r.name,
          Count: r.count,
          Percent: `${r.percent}%`,
        }))
      ),
      "By referral"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byAgeGroup.map((r) => ({
          "Age group": r.label,
          Count: r.count,
          Percent: `${r.percent}%`,
        }))
      ),
      "By age group"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.byMonth.map((r) => ({
          Month: r.label,
          Count: r.count,
        }))
      ),
      "By month"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        data.detail.map((r) => ({
          Code: r.patientCode,
          "First name": r.firstName,
          "Last name": r.lastName,
          Gender: r.gender,
          Phone: r.phone,
          Email: r.email,
          City: r.city,
          Village: r.village,
          Address: r.address,
          Referral: r.referralSource,
          Age: r.ageYears ?? "",
          "Age group": r.ageGroup,
          "Registered at": r.registeredAt,
        }))
      ),
      "Detail"
    );

    XLSX.writeFile(wb, `client-registration-report-${safeName}-${data.from}_${data.to}.xlsx`);
  }, [data]);

  const genderChart = useMemo(() => {
    if (!data?.byGender.length) return null;
    const labels = data.byGender.map((r) => r.label);
    const series = data.byGender.map((r) => r.count);
    return { options: donutOptions(labels, series, "By gender"), series };
  }, [data]);

  const ageChart = useMemo(() => {
    if (!data?.byAgeGroup.length) return null;
    const labels = data.byAgeGroup.map((r) => r.label);
    const series = data.byAgeGroup.map((r) => r.count);
    return { options: donutOptions(labels, series, "By age group"), series };
  }, [data]);

  const referralChart = useMemo(() => {
    if (!data?.byReferralSource.length) return null;
    const rows = data.byReferralSource.map((r) => ({ name: r.name, count: r.count }));
    const { labels, series } = topNForChart(rows, 8);
    return { options: donutOptions(labels, series, "By referral source"), series };
  }, [data]);

  const cityChart = useMemo(() => {
    if (!data?.byCity.length) return null;
    const rows = data.byCity.map((r) => ({ name: r.cityName, count: r.count }));
    const { labels, series } = topNForChart(rows, 10);
    return { options: donutOptions(labels, series, "By city (top 10)"), series };
  }, [data]);

  const monthBar = useMemo(() => {
    if (!data?.byMonth.length) return null;
    const categories = data.byMonth.map((m) => m.label);
    const series = [{ name: "New members", data: data.byMonth.map((m) => m.count) }];
    return {
      options: barOptions(categories, "New members by month"),
      series,
    };
  }, [data]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Client registration report" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have access to this report.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <PageBreadCrumb pageTitle="Client registration report" />

        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Full breakdown of clients <strong className="font-medium text-gray-700 dark:text-gray-300">first registered</strong> at
        the selected branch within the date range: demographics, locality, referral, age, and monthly trend. Percentages are of
        all new registrations in the period (after any filters). Use <strong className="font-medium text-gray-700 dark:text-gray-300">City</strong> /{" "}
        <strong className="font-medium text-gray-700 dark:text-gray-300">Village</strong> to narrow by locality, and{" "}
        <strong className="font-medium text-gray-700 dark:text-gray-300">Age report</strong> (min/max years) for known ages only; leave blank for all.
        </p>
      </div>

      <form
        onSubmit={runReport}
        className="mt-6 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 print:hidden dark:border-gray-800 dark:bg-white/3 md:flex-row md:flex-wrap md:items-end"
      >
        {error && (
          <div className="w-full rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}
        <div className="min-w-[200px] flex-1">
          <Label>Registration branch *</Label>
          <select
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <DateField id="nm-from" label="From *" value={from} onChange={setFrom} appendToBody />
        <DateField id="nm-to" label="To *" value={to} onChange={setTo} appendToBody />
        <div className="min-w-[200px] flex-1">
          <Label>City</Label>
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Optional — filter by locality.</p>
          <select
            value={filterCityId}
            onChange={(e) => {
              setFilterCityId(e.target.value);
              setFilterVillageId("");
            }}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <Label>Village</Label>
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Optional — choose city first.</p>
          <select
            value={filterVillageId}
            onChange={(e) => setFilterVillageId(e.target.value)}
            disabled={!filterCityId}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:text-white"
          >
            <option value="">{filterCityId ? "All villages in city" : "Select city first"}</option>
            {villages.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px]">
          <Label>Age report (years)</Label>
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Optional range; excludes unknown age.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              max={130}
              step={1}
              inputMode="numeric"
              placeholder="Min"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              className="h-11 w-20 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
            <span className="text-sm text-gray-500">–</span>
            <input
              type="number"
              min={0}
              max={130}
              step={1}
              inputMode="numeric"
              placeholder="Max"
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              className="h-11 w-20 rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Loading…" : "Run report"}
        </Button>
      </form>

      {data && (
        <div
          id="client-registration-report"
          className="mt-8 space-y-8 print:mt-4 print:space-y-6"
        >
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button type="button" variant="outline" size="sm" onClick={exportExcel}>
              Export Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              Print
            </Button>
          </div>

          <header className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3 print:border-gray-300">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Client registration report</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Branch: <span className="font-medium text-gray-900 dark:text-white">{data.branch.name}</span>
              {" · "}
              {data.from} → {data.to}
              {(data.ageFilter.min != null || data.ageFilter.max != null) && (
                <>
                  {" · "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    Age {data.ageFilter.min ?? "…"}–{data.ageFilter.max ?? "…"} yrs
                  </span>
                </>
              )}
              {(data.locationFilter.cityId != null || data.locationFilter.villageId != null) && (
                <>
                  {" · "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {data.locationFilter.villageId != null
                      ? `${data.locationFilter.cityName ?? "—"} — ${data.locationFilter.villageName ?? "—"}`
                      : data.locationFilter.cityName ?? "—"}
                  </span>
                </>
              )}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{data.totalNewMembers}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">total new members</p>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { label: "With phone", v: data.summary.withPhone, p: data.summary.withPhonePercent },
                { label: "With email", v: data.summary.withEmail, p: data.summary.withEmailPercent },
                {
                  label: "With city & village",
                  v: data.summary.withCityAndVillage,
                  p: data.summary.withCityAndVillagePercent,
                },
              ] as const
            ).map((k) => (
              <div
                key={k.label}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{k.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
                  {k.v}{" "}
                  <span className="text-sm font-normal text-gray-500">({k.p}%)</span>
                </p>
              </div>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-1">
            {genderChart && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
                <ReactApexChart
                  options={genderChart.options}
                  series={genderChart.series}
                  type="donut"
                  height={320}
                />
              </div>
            )}
            {ageChart && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
                <ReactApexChart options={ageChart.options} series={ageChart.series} type="donut" height={320} />
              </div>
            )}
            {referralChart && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
                <ReactApexChart
                  options={referralChart.options}
                  series={referralChart.series}
                  type="donut"
                  height={320}
                />
              </div>
            )}
            {cityChart && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
                <ReactApexChart options={cityChart.options} series={cityChart.series} type="donut" height={320} />
              </div>
            )}
          </div>

          {monthBar && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
              <ReactApexChart options={monthBar.options} series={monthBar.series} type="bar" height={320} />
            </div>
          )}

          <ReportTable
            title="By city"
            headers={["City", "Count", "% of total"]}
            rows={data.byCity.map((r) => [r.cityName, r.count, `${r.percent}%`])}
            empty={data.byCity.length === 0}
          />

          <ReportTable
            title="By village"
            headers={["City", "Village", "Count", "% of total"]}
            rows={data.byVillage.map((r) => [r.cityName, r.villageName, r.count, `${r.percent}%`])}
            empty={data.byVillage.length === 0}
          />

          <ReportTable
            title="By gender"
            headers={["Gender", "Count", "% of total"]}
            rows={data.byGender.map((r) => [r.label, r.count, `${r.percent}%`])}
            empty={data.byGender.length === 0}
          />

          <ReportTable
            title="By referral source"
            headers={["Referral", "Count", "% of total"]}
            rows={data.byReferralSource.map((r) => [r.name, r.count, `${r.percent}%`])}
            empty={data.byReferralSource.length === 0}
          />

          <ReportTable
            title="By age group"
            headers={["Age group", "Count", "% of total"]}
            rows={data.byAgeGroup.map((r) => [r.label, r.count, `${r.percent}%`])}
            empty={data.byAgeGroup.length === 0}
          />

          <ReportTable
            title="By month (registration date)"
            headers={["Month", "Count"]}
            rows={data.byMonth.map((r) => [r.label, r.count])}
            empty={data.byMonth.length === 0}
          />

          <section>
            <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Client detail</h3>
            {data.detailTruncated && (
              <p className="mb-2 text-sm text-amber-700 dark:text-amber-400/90">
                Showing the most recent {data.detail.length} of {data.detailTotal} rows. Export Excel includes the same sample;
                widen filters or contact an administrator for full extracts.
              </p>
            )}
            <div className="max-h-[480px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800 print:max-h-none">
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Gender</TableCell>
                    <TableCell isHeader>City</TableCell>
                    <TableCell isHeader>Village</TableCell>
                    <TableCell isHeader>Referral</TableCell>
                    <TableCell isHeader>Age</TableCell>
                    <TableCell isHeader>Age grp</TableCell>
                    <TableCell isHeader>Registered</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detail.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-gray-500">
                        No rows
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.detail.map((r, idx) => (
                      <TableRow key={`${r.patientCode}-${idx}`}>
                        <TableCell className="font-mono text-xs">{r.patientCode}</TableCell>
                        <TableCell>
                          {r.firstName} {r.lastName}
                        </TableCell>
                        <TableCell>{r.gender || "—"}</TableCell>
                        <TableCell>{r.city || "—"}</TableCell>
                        <TableCell>{r.village || "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate">
                          <span title={r.referralSource}>{r.referralSource || "—"}</span>
                        </TableCell>
                        <TableCell className="tabular-nums">{r.ageYears ?? "—"}</TableCell>
                        <TableCell>{r.ageGroup}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                          {r.registeredAt.slice(0, 10)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ReportTable({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  empty: boolean;
}) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="bg-transparent! hover:bg-transparent!">
              {headers.map((h) => (
                <TableCell key={h} isHeader>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {empty ? (
              <TableRow>
                <TableCell colSpan={headers.length} className="text-center text-sm text-gray-500">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              rows.map((cells, i) => (
                <TableRow key={i}>
                  {cells.map((c, j) => (
                    <TableCell key={j} className={j === cells.length - 1 ? "text-right tabular-nums" : ""}>
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
