"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";
import { MAIN_LOGO_PATH } from "@/lib/brand-logos";
import {
  printLabAnswerSheet,
  type LabOrderPrintItem,
  type LabOrderPrintPayload,
} from "@/lib/print-lab-order-sheets";
import { Pencil, Printer } from "lucide-react";

type LabOrderDetail = {
  id: number;
  status: string;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  patient: {
    id: number;
    patientCode: string;
    name: string;
    gender?: string | null;
    age?: number | null;
    dateOfBirth?: string | null;
  };
  doctor: { id: number; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
  };
  items: {
    id: number;
    unitPrice: number;
    resultValue: string | null;
    resultUnit: string | null;
    status: string;
    notes: string | null;
    recordedAt: string | null;
    panelParentTestId: number | null;
    panelParentTest: { id: number; name: string } | null;
    recordedBy: { id: number; name: string | null } | null;
    labTest: {
      id: number;
      name: string;
      unit: string | null;
      normalRange: string | null;
      price: number;
      parentTestId: number | null;
      category: { id: number; name: string };
    };
  }[];
};

type ResultFlag = "high" | "low" | "normal" | "pending";

type ResultRow = {
  itemId: number;
  lineNo: number;
  categoryName: string;
  panelLabel: string | null;
  testName: string;
  normalRange: string;
  unit: string;
  resultValue: string;
  resultUnit: string;
  notes: string;
  status: string;
  flag: ResultFlag;
  recordedAt: string | null;
  recordedByName: string | null;
};

function formatVisitDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function patientAgeLabel(p: LabOrderDetail["patient"]): string {
  if (p.age != null && Number.isFinite(p.age) && p.age >= 0 && p.age < 150) {
    return `${Math.floor(p.age)} yrs`;
  }
  if (p.dateOfBirth) {
    const d = new Date(p.dateOfBirth);
    if (!Number.isNaN(d.getTime())) {
      const yrs = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (yrs >= 0 && yrs < 150) return `${yrs} yrs`;
    }
  }
  return "—";
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function interpretFlag(resultValue: string, normalRange: string, status: string): ResultFlag {
  if (status !== "completed" && !resultValue.trim()) return "pending";
  const n = parseNumeric(resultValue);
  const range = normalRange.trim();
  if (n == null || !range) return resultValue.trim() ? "normal" : "pending";

  const between = range.match(/(-?\d+(?:\.\d+)?)\s*[-–to]+\s*(-?\d+(?:\.\d+)?)/i);
  if (between) {
    const low = Number(between[1]);
    const high = Number(between[2]);
    if (n < low) return "low";
    if (n > high) return "high";
    return "normal";
  }
  const lt = range.match(/^(?:<|<=)\s*(-?\d+(?:\.\d+)?)/);
  if (lt) return n > Number(lt[1]) ? "high" : "normal";
  const gt = range.match(/^(?:>|>=)\s*(-?\d+(?:\.\d+)?)/);
  if (gt) return n < Number(gt[1]) ? "low" : "normal";
  return "normal";
}

function flagLabel(flag: ResultFlag) {
  if (flag === "high") return "High";
  if (flag === "low") return "Low";
  if (flag === "pending") return "Pending";
  return "Normal";
}

function flagClasses(flag: ResultFlag) {
  if (flag === "high") {
    return "bg-error-50 text-error-700 ring-1 ring-error-100 dark:bg-error-500/15 dark:text-error-300 dark:ring-error-500/20";
  }
  if (flag === "low") {
    return "bg-sky-50 text-sky-800 ring-1 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/20";
  }
  if (flag === "pending") {
    return "bg-amber-50 text-amber-900 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20";
  }
  return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20";
}

function resultValueClasses(flag: ResultFlag) {
  if (flag === "high") return "text-error-700 dark:text-error-300";
  if (flag === "low") return "text-sky-800 dark:text-sky-300";
  if (flag === "pending") return "text-gray-400 dark:text-gray-500";
  return "text-gray-900 dark:text-white";
}

export default function LabOrderResultViewPage() {
  const params = useParams();
  const orderId = Number(params.id);
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("lab.view");
  const canEdit = hasPermission("lab.edit");

  const [order, setOrder] = useState<LabOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/lab/orders/${orderId}`);
      if (!res.ok) {
        if (!cancelled) {
          setOrder(null);
          setLoading(false);
        }
        return;
      }
      const data = (await res.json()) as LabOrderDetail;
      if (!cancelled) {
        setOrder(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const rows = useMemo((): ResultRow[] => {
    if (!order) return [];
    return order.items.map((item, index) => {
      const resultValue = (item.resultValue ?? "").trim();
      const normalRange = item.labTest.normalRange?.trim() || "—";
      return {
        itemId: item.id,
        lineNo: index + 1,
        categoryName: item.labTest.category?.name ?? "Uncategorized",
        panelLabel: item.panelParentTest?.name ?? null,
        testName: item.labTest.name,
        normalRange,
        unit: item.resultUnit?.trim() || item.labTest.unit?.trim() || "—",
        resultValue,
        resultUnit: item.resultUnit?.trim() || "",
        notes: (item.notes ?? "").trim(),
        status: item.status,
        flag: interpretFlag(resultValue, normalRange === "—" ? "" : normalRange, item.status),
        recordedAt: item.recordedAt,
        recordedByName: item.recordedBy?.name ?? null,
      };
    });
  }, [order]);

  const grouped = useMemo(() => groupLabOrderRowsByCategoryAndPanel(rows), [rows]);

  const summary = useMemo(() => {
    const total = rows.length;
    const recorded = rows.filter((r) => r.status === "completed" || r.resultValue).length;
    const high = rows.filter((r) => r.flag === "high").length;
    const low = rows.filter((r) => r.flag === "low").length;
    const pending = total - recorded;
    return { total, recorded, pending, high, low };
  }, [rows]);

  const lastRecorded = useMemo(() => {
    const withTime = rows
      .filter((r) => r.recordedAt)
      .sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
    return withTime[0] ?? null;
  }, [rows]);

  function handlePrint() {
    if (!order) return;
    const items: LabOrderPrintItem[] = rows.map((r) => ({
      lineNo: r.lineNo,
      testName: r.testName,
      categoryName: r.categoryName,
      panelLabel: r.panelLabel,
      normalRange: r.normalRange,
      unit: r.unit,
      unitPrice: order.items.find((i) => i.id === r.itemId)?.unitPrice ?? 0,
      resultValue: r.resultValue,
      resultUnit: r.resultUnit,
      notes: r.notes,
    }));
    const payload: LabOrderPrintPayload = {
      orderId: order.id,
      documentDate: new Date().toISOString(),
      appointmentDate: order.appointment.appointmentDate,
      appointmentTime: order.appointment.startTime,
      branchName: order.appointment.branch?.name ?? null,
      patientName: order.patient.name,
      patientCode: order.patient.patientCode,
      doctorName: order.doctor.name,
      orderNotes: order.notes,
      patientSex: order.patient.gender ?? null,
      patientAgeLabel: patientAgeLabel(order.patient),
      reportedByName: user?.name ?? lastRecorded?.recordedByName ?? null,
      items,
    };
    printLabAnswerSheet(payload);
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab result" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-600 dark:text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-600" />
        <p className="text-sm">Loading result…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab result" />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">Lab order not found.</p>
        <Link href="/lab/orders" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Back to orders
        </Link>
      </div>
    );
  }

  const completed = summary.pending === 0 && summary.total > 0;
  const cancelled = order.status === "cancelled";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageBreadCrumb pageTitle={`Lab result · #${order.id}`} />
        <div className="flex flex-wrap gap-2">
          <Link href="/lab/orders">
            <Button variant="outline" size="sm">
              Back to orders
            </Button>
          </Link>
          {canEdit ? (
            <Link href={`/lab/orders/${order.id}/results`}>
              <Button variant="outline" size="sm">
                <span className="inline-flex items-center gap-2">
                  <Pencil className="h-4 w-4" aria-hidden />
                  {summary.recorded > 0 ? "Edit results" : "Enter results"}
                </span>
              </Button>
            </Link>
          ) : null}
          <Button size="sm" onClick={handlePrint} disabled={summary.recorded === 0}>
            <span className="inline-flex items-center gap-2">
              <Printer className="h-4 w-4" aria-hidden />
              Print report
            </span>
          </Button>
        </div>
      </div>

      <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/3">
        <header className="relative overflow-hidden border-b border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-white px-6 py-7 dark:border-brand-500/20 dark:from-brand-500/10 dark:via-transparent dark:to-transparent sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                <Image src={MAIN_LOGO_PATH} alt="Call a Doctor" width={48} height={48} className="object-contain" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700 dark:text-brand-400">
                  Laboratory report
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{order.patient.name}</h1>
                <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">{order.patient.patientCode}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-gray-700 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700">
                Order #{order.id}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  cancelled
                    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    : completed
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                }`}
              >
                {cancelled ? "Cancelled" : completed ? "All results in" : `${summary.recorded}/${summary.total} recorded`}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-3 border-b border-gray-100 px-6 py-5 dark:border-gray-800 sm:px-8 sm:grid-cols-2 lg:grid-cols-4">
          <MetaCell label="Sex" value={order.patient.gender || "—"} />
          <MetaCell label="Age" value={patientAgeLabel(order.patient)} />
          <MetaCell label="Doctor" value={order.doctor.name} />
          <MetaCell
            label="Visit"
            value={`${formatVisitDate(order.appointment.appointmentDate)} · ${order.appointment.startTime}`}
          />
          <MetaCell label="Branch" value={order.appointment.branch?.name || "—"} />
          <MetaCell label="Requested" value={formatDateTime(order.createdAt)} />
          <MetaCell label="Reported by" value={lastRecorded?.recordedByName || "—"} />
          <MetaCell label="Last result" value={formatDateTime(lastRecorded?.recordedAt)} />
        </section>

        {order.notes ? (
          <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Order notes</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200">{order.notes}</p>
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <StatChip label="Tests" value={String(summary.total)} />
          <StatChip label="Recorded" value={String(summary.recorded)} tone="emerald" />
          <StatChip label="High" value={String(summary.high)} tone="error" />
          <StatChip label="Low" value={String(summary.low)} tone="sky" />
        </section>

        <section className="space-y-8 px-6 pb-8 sm:px-8">
          {grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No tests on this request.</p>
          ) : (
            grouped.map((cat) => (
              <div key={cat.categoryName}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                  {cat.categoryName}
                </h2>
                <div className="space-y-4">
                  {cat.segments.map((seg, segIdx) => (
                    <div
                      key={`${cat.categoryName}-${seg.panelLabel ?? "solo"}-${segIdx}`}
                      className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
                    >
                      {seg.panelLabel ? (
                        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 dark:border-gray-800 dark:bg-white/5 dark:text-gray-100">
                          Panel · {seg.panelLabel}
                        </div>
                      ) : null}
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {seg.rows.map((row) => (
                          <div key={row.itemId} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white">{row.testName}</p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Reference: {row.normalRange}
                                {row.unit && row.unit !== "—" ? ` · ${row.unit}` : ""}
                              </p>
                              {row.notes ? (
                                <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                                  Note: {row.notes}
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <p className={`text-xl font-semibold tabular-nums ${resultValueClasses(row.flag)}`}>
                                {row.resultValue || "—"}
                                {row.resultValue && row.unit && row.unit !== "—" ? (
                                  <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                                    {row.unit}
                                  </span>
                                ) : null}
                              </p>
                              {row.recordedAt ? (
                                <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                                  {formatDateTime(row.recordedAt)}
                                  {row.recordedByName ? ` · ${row.recordedByName}` : ""}
                                </p>
                              ) : null}
                            </div>
                            <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${flagClasses(row.flag)}`}>
                              {flagLabel(row.flag)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </article>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "emerald" | "error" | "sky";
}) {
  const tones = {
    gray: "bg-gray-50 text-gray-800 dark:bg-white/5 dark:text-gray-100",
    emerald: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
    error: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300",
    sky: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
