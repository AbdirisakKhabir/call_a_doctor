"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api";

export default function StatsPercentagesCard() {
  const [data, setData] = useState<{
    counts: { lowStock: number; products: number };
    percentages: { appointmentCompletionRate: number; lowStockPercent: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.percentages) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  const completionRate = data?.percentages.appointmentCompletionRate ?? 0;
  const lowStockPercent = data?.percentages.lowStockPercent ?? 0;
  const lowStockCount = data?.counts.lowStock ?? 0;
  const productsCount = data?.counts.products ?? 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Key Metrics</h3>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Calendar completion rate</span>
            <span className="text-lg font-bold text-green-600 dark:text-green-400">{completionRate}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(100, completionRate)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Low Stock Products</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {lowStockCount} / {productsCount} ({lowStockPercent}%)
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, lowStockPercent)}%` }}
            />
          </div>
          {lowStockCount > 0 && (
            <Link href="/pharmacy/inventory" className="mt-2 block text-sm text-amber-600 hover:underline dark:text-amber-400">
              View inventory →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
