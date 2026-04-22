"use client";

import React, { useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { authFetch } from "@/lib/api";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function AppointmentRevenueChart() {
  const [categories, setCategories] = useState<string[]>([]);
  const [series, setSeries] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.charts?.appointmentRevenueByMonth) {
          const chart = data.charts.appointmentRevenueByMonth;
          setCategories(chart.map((x: { month: string }) => x.month));
          setSeries(chart.map((x: { total: number }) => x.total));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const options: ApexOptions = {
    colors: ["#f59e0b"],
    chart: {
      fontFamily: "Roboto, sans-serif",
      type: "area",
      toolbar: { show: false },
      stacked: false,
    },
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0.1 } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (val) => `$${val}`,
      },
    },
    grid: {
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      y: { formatter: (val: number) => `$${val.toFixed(2)}` },
    },
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Calendar revenue (this year)</h3>
        <div className="h-[280px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Calendar revenue (this year)</h3>
      <div className="-ml-5 min-w-[500px] pl-2">
        <ReactApexChart options={options} series={[{ name: "Revenue", data: series }]} type="area" height={280} />
      </div>
    </div>
  );
}
