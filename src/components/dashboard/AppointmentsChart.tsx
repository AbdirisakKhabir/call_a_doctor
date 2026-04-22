"use client";

import React, { useEffect, useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { authFetch } from "@/lib/api";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function AppointmentsChart() {
  const [categories, setCategories] = useState<string[]>([]);
  const [series, setSeries] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.charts?.appointmentsByMonth) {
          const chart = data.charts.appointmentsByMonth;
          setCategories(chart.map((x: { month: string }) => x.month));
          setSeries(chart.map((x: { count: number }) => x.count));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const options: ApexOptions = {
    colors: ["#10b981"],
    chart: {
      fontFamily: "Roboto, sans-serif",
      type: "bar",
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    grid: {
      yaxis: { lines: { show: true } },
    },
    fill: { opacity: 1 },
    tooltip: {
      y: { formatter: (val: number) => `${val} bookings` },
    },
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Calendar by month</h3>
        <div className="h-[280px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Calendar by month</h3>
      <div className="-ml-5 min-w-[500px] pl-2">
        <ReactApexChart options={options} series={[{ name: "Bookings", data: series }]} type="bar" height={280} />
      </div>
    </div>
  );
}
