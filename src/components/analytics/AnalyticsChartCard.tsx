"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import type { AnalyticsChart } from "@/lib/analytics/types";
import { ANALYTICS_PALETTE, formatAnalyticsAxis, formatAnalyticsValue } from "./format";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const SPAN_CLASS: Record<AnalyticsChart["span"], string> = {
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  12: "lg:col-span-12",
};

/** Column charts get unreadable once labels overlap, so rotate them past this many categories. */
const ROTATE_LABELS_AFTER = 12;
const BASE_HEIGHT = 320;
const HBAR_ROW_HEIGHT = 34;

function hasAnyValue(chart: AnalyticsChart): boolean {
  return chart.categories.length > 0 && chart.series.some((s) => s.data.some((v) => v !== 0));
}

export default function AnalyticsChartCard({ chart }: { chart: AnalyticsChart }) {
  const isDonut = chart.type === "donut";
  const isHorizontal = chart.type === "hbar";

  const height = useMemo(() => {
    if (isHorizontal) return Math.max(260, 60 + chart.categories.length * HBAR_ROW_HEIGHT);
    if (isDonut) return 340;
    return BASE_HEIGHT;
  }, [chart.categories.length, isDonut, isHorizontal]);

  const options: ApexOptions = useMemo(() => {
    const shared: ApexOptions = {
      chart: {
        type: isHorizontal ? "bar" : (chart.type as "bar" | "line" | "area" | "donut"),
        toolbar: { show: false },
        fontFamily: "inherit",
        stacked: chart.stacked ?? false,
        animations: { enabled: true },
      },
      colors: ANALYTICS_PALETTE,
      dataLabels: { enabled: false },
      legend: {
        show: isDonut || chart.series.length > 1,
        position: isDonut ? "bottom" : "top",
        horizontalAlign: isDonut ? "center" : "left",
        fontSize: "12px",
        markers: { size: 6 },
      },
      grid: { borderColor: "rgba(148, 163, 184, 0.25)", strokeDashArray: 4 },
      noData: { text: "No data for this period" },
    };

    if (isDonut) {
      const total = chart.series[0]?.data.reduce((a, b) => a + b, 0) ?? 0;
      return {
        ...shared,
        labels: chart.categories,
        plotOptions: {
          pie: {
            donut: {
              size: "62%",
              labels: {
                show: true,
                value: { formatter: (val: string) => formatAnalyticsValue(Number(val), chart.format) },
                total: {
                  show: true,
                  label: "Total",
                  formatter: () => formatAnalyticsValue(total, chart.format),
                },
              },
            },
          },
        },
        tooltip: {
          y: {
            formatter: (val: number) => {
              const share = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
              return `${formatAnalyticsValue(val, chart.format)} (${share}%)`;
            },
          },
        },
      };
    }

    return {
      ...shared,
      plotOptions: {
        bar: {
          horizontal: isHorizontal,
          borderRadius: 4,
          borderRadiusApplication: "end",
          columnWidth: chart.categories.length > 20 ? "80%" : "55%",
          barHeight: "70%",
        },
      },
      stroke:
        chart.type === "line" || chart.type === "area"
          ? { curve: "smooth", width: 2 }
          : { show: false, width: 0 },
      fill:
        chart.type === "area"
          ? { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 90] } }
          : { type: "solid" },
      markers: { size: 0, hover: { size: 4 } },
      xaxis: {
        categories: chart.categories,
        labels: isHorizontal
          ? { formatter: (val: string) => formatAnalyticsAxis(Number(val), chart.format) }
          : {
              rotate: chart.categories.length > ROTATE_LABELS_AFTER ? -45 : 0,
              rotateAlways: chart.categories.length > ROTATE_LABELS_AFTER,
              hideOverlappingLabels: true,
              style: { fontSize: "11px" },
            },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
      },
      yaxis: {
        labels: isHorizontal
          ? { maxWidth: 200, style: { fontSize: "12px" } }
          : { formatter: (val: number) => formatAnalyticsAxis(val, chart.format), style: { fontSize: "11px" } },
      },
      tooltip: {
        shared: !isHorizontal,
        intersect: false,
        y: { formatter: (val: number) => formatAnalyticsValue(val, chart.format) },
      },
    };
  }, [chart, isDonut, isHorizontal]);

  const series = useMemo(() => {
    if (isDonut) return chart.series[0]?.data ?? [];
    return chart.series.map((s) => ({ name: s.name, data: s.data }));
  }, [chart.series, isDonut]);

  const apexType = isHorizontal ? "bar" : (chart.type as "bar" | "line" | "area" | "donut");

  return (
    <div
      className={`col-span-1 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 ${SPAN_CLASS[chart.span]}`}
    >
      <div className="mb-1 px-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{chart.title}</h3>
        {chart.subtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{chart.subtitle}</p>
        ) : null}
      </div>
      {hasAnyValue(chart) ? (
        <div className="-mx-2 min-w-0 overflow-x-auto">
          <ReactApexChart options={options} series={series} type={apexType} height={height} />
        </div>
      ) : (
        <div className="flex h-56 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          No data for this period.
        </div>
      )}
    </div>
  );
}
