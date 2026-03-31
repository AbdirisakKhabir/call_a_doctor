"use client";

import React, { useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { authFetch } from "@/lib/api";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const STATUS_COLORS: Record<string, string> = {
  scheduled: "#5fb970",
  completed: "#10b981",
  cancelled: "#ef4444",
  "no-show": "#f59e0b",
};

export default function AppointmentStatusChart() {
  const [series, setSeries] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.charts?.appointmentsByStatus?.length) {
          const chart = data.charts.appointmentsByStatus;
          setLabels(chart.map((x: { status: string }) => x.status.charAt(0).toUpperCase() + x.status.slice(1).replace(/-/g, " ")));
          setSeries(chart.map((x: { count: number }) => x.count));
        } else {
          setLabels([]);
          setSeries([]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const options: ApexOptions = {
    chart: {
      fontFamily: "Roboto, sans-serif",
      type: "donut",
      toolbar: { show: false },
    },
    colors: labels.map((l) => STATUS_COLORS[l.toLowerCase().replace(/\s/g, "-")] ?? "#6b7280"),
    labels,
    legend: {
      position: "bottom",
      horizontalAlign: "center",
    },
    plotOptions: {
      pie: {
        donut: {
          size: "65%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              formatter: () => series.reduce((a, b) => a + b, 0).toString(),
            },
          },
        },
      },
    },
    dataLabels: { enabled: true },
    tooltip: {
      y: {
        formatter: (val: number) => {
          const total = series.reduce((a, b) => a + b, 0);
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
          return `${val} (${pct}%)`;
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Appointments by Status</h3>
        <div className="h-[280px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Appointments by Status</h3>
        <div className="flex h-[200px] items-center justify-center text-gray-500 dark:text-gray-400">No appointments yet</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Appointments by Status</h3>
      <div className="flex justify-center">
        <ReactApexChart options={options} series={series} type="donut" height={280} />
      </div>
    </div>
  );
}
