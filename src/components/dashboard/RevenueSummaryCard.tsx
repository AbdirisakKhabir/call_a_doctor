"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DollarLineIcon, PosIcon } from "@/icons";
import { authFetch } from "@/lib/api";

export default function RevenueSummaryCard() {
  const [data, setData] = useState<{
    revenue: { total: number; pharmacy: number; appointments: number };
    percentages: { appointmentCompletionRate: number; lowStockPercent: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.revenue) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <div className="h-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  const total = data?.revenue.total ?? 0;
  const pharmacy = data?.revenue.pharmacy ?? 0;
  const appointments = data?.revenue.appointments ?? 0;
  const pharmacyPct = total > 0 ? ((pharmacy / total) * 100).toFixed(1) : "0";
  const appointmentsPct = total > 0 ? ((appointments / total) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
        <DollarLineIcon className="h-5 w-5 text-brand-500" />
        Revenue Summary (This Year)
      </h3>
      <div className="space-y-4">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Pharmacy</span>
            <span>
              ${pharmacy.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({pharmacyPct}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${pharmacyPct}%` }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">Appointments</span>
            <span>
              ${appointments.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({appointmentsPct}%)
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${appointmentsPct}%` }}
            />
          </div>
        </div>
        <div className="flex gap-4 pt-2">
          <Link
            href="/pharmacy/pos"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
          >
            <PosIcon className="size-4 shrink-0" aria-hidden />
            Pharmacy POS →
          </Link>
          <Link href="/appointments" className="text-sm font-medium text-amber-500 hover:underline">
            Appointments →
          </Link>
        </div>
      </div>
    </div>
  );
}
