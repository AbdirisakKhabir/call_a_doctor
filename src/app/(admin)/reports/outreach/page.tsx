"use client";

import React from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useOutreachReport } from "@/components/reports/outreach/OutreachReportsProvider";
import { useAuth } from "@/context/AuthContext";

function fmtRange(from: string, to: string) {
  const a = new Date(from + "T12:00:00");
  const b = new Date(to + "T12:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from} – ${to}`;
  return `${a.toLocaleDateString(undefined, { dateStyle: "medium" })} – ${b.toLocaleDateString(undefined, { dateStyle: "medium" })}`;
}

export default function OutreachOverviewPage() {
  const { hasPermission } = useAuth();
  const { data, loading, dateFrom, dateTo } = useOutreachReport();

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Outreach reports" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  const sales = data?.salesFromPharmacy ?? [];
  const returns = data?.returnsToPharmacy ?? [];
  const dispenses = data?.dispensesToPatients ?? [];
  const snapshot = data?.teamInventorySnapshot ?? [];

  const totalIssuance = sales.reduce((s, x) => s + x.totalAmount, 0);
  const totalReturns = returns.reduce((s, x) => s + x.totalAmount, 0);
  const totalDispenses = dispenses.reduce((s, x) => s + x.totalAmount, 0);
  const totalAr = snapshot.reduce((s, x) => s + x.creditBalance, 0);

  const kpis = [
    {
      label: "Pharmacy issuance",
      sub: "Stock to outreach (POS credit / paid)",
      value: totalIssuance,
      href: "/reports/outreach/issuance",
      accent: "from-emerald-500/15 to-emerald-600/5 border-emerald-200/80 dark:border-emerald-500/20",
    },
    {
      label: "Returns to pharmacy",
      sub: "Stock credited back, AR reduced",
      value: totalReturns,
      href: "/reports/outreach/returns",
      accent: "from-sky-500/15 to-sky-600/5 border-sky-200/80 dark:border-sky-500/20",
    },
    {
      label: "Emergency medication",
      sub: "Field visits — charges to patient balance",
      value: totalDispenses,
      href: "/reports/outreach/dispenses",
      accent: "from-violet-500/15 to-violet-600/5 border-violet-200/80 dark:border-violet-500/20",
    },
    {
      label: "Team AR (snapshot)",
      sub: "Outstanding credit by team (end of period view)",
      value: totalAr,
      href: "/reports/outreach/inventory",
      accent: "from-amber-500/15 to-amber-600/5 border-amber-200/80 dark:border-amber-500/20",
    },
  ];

  return (
    <div>
      <PageBreadCrumb pageTitle="Outreach reports" />
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Period:{" "}
        <span className="font-medium text-gray-900 dark:text-white">
          {data?.dateFrom && data?.dateTo ? fmtRange(data.dateFrom, data.dateTo) : fmtRange(dateFrom, dateTo)}
        </span>
      </p>

      {loading && !data ? (
        <div className="mt-10 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <Link
                key={k.label}
                href={k.href}
                className={`group rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition hover:shadow-md dark:shadow-none ${k.accent}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {k.label}
                </p>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
                  ${k.value.toFixed(2)}
                </p>
                <p className="mt-2 text-xs leading-snug text-gray-600 dark:text-gray-400">{k.sub}</p>
                <span className="mt-3 inline-flex text-sm font-medium text-brand-600 group-hover:underline dark:text-brand-400">
                  View detail →
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
