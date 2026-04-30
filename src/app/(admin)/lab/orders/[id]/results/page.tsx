"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";
import {
  printLabAnswerSheet,
  printLabRequestSheet,
  type LabOrderPrintItem,
  type LabOrderPrintPayload,
} from "@/lib/print-lab-order-sheets";

type LineForm = {
  resultValue: string;
  resultUnit: string;
  notes: string;
};

type LabOrderDetail = {
  id: number;
  status: string;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
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
    panelParentTestId: number | null;
    panelParentTest: { id: number; name: string } | null;
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

type ResultRowModel = {
  itemId: number;
  lineNo: number;
  categoryName: string;
  panelLabel: string | null;
  testName: string;
  normalRange: string;
  unit: string;
  unitPrice: number;
  status: string;
};

function formatApptDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function normalizeLineFields(l: LineForm | undefined): { rv: string; ru: string; n: string } {
  if (!l) return { rv: "", ru: "", n: "" };
  return {
    rv: l.resultValue.trim(),
    ru: l.resultUnit.trim(),
    n: l.notes.trim(),
  };
}

function linesAreDirty(
  order: LabOrderDetail,
  current: Record<number, LineForm>,
  baseline: Record<number, LineForm>
): boolean {
  for (const item of order.items) {
    const a = normalizeLineFields(current[item.id]);
    const b = normalizeLineFields(baseline[item.id]);
    if (a.rv !== b.rv || a.ru !== b.ru || a.n !== b.n) return true;
  }
  return false;
}

function toPrintItems(
  order: LabOrderDetail,
  lines: Record<number, LineForm>,
  lineMeta: ResultRowModel[]
): LabOrderPrintItem[] {
  const metaByItem = new Map(lineMeta.map((m) => [m.itemId, m]));
  return order.items.map((it) => {
    const m = metaByItem.get(it.id);
    const lf = lines[it.id] ?? { resultValue: "", resultUnit: "", notes: "" };
    return {
      lineNo: m?.lineNo ?? 0,
      testName: it.labTest.name,
      categoryName: m?.categoryName ?? it.labTest.category?.name ?? "Uncategorized",
      panelLabel: m?.panelLabel ?? null,
      normalRange: it.labTest.normalRange?.trim() ? it.labTest.normalRange : "—",
      unit: it.labTest.unit?.trim() ? it.labTest.unit : "—",
      unitPrice: it.unitPrice,
      resultValue: lf.resultValue,
      resultUnit: lf.resultUnit,
      notes: lf.notes,
    };
  });
}

function printPayloadFromOrder(
  order: LabOrderDetail,
  items: LabOrderPrintItem[],
  isoNow: string
): LabOrderPrintPayload {
  return {
    orderId: order.id,
    documentDate: isoNow,
    appointmentDate: order.appointment.appointmentDate,
    appointmentTime: order.appointment.startTime,
    branchName: order.appointment.branch?.name ?? null,
    patientName: order.patient.name,
    patientCode: order.patient.patientCode,
    doctorName: order.doctor.name,
    orderNotes: order.notes,
    items,
  };
}

export default function LabOrderResultsPage() {
  const params = useParams();
  const router = useRouter();
  const orderIdRaw = params.id;
  const orderId = Number(orderIdRaw);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission("lab.edit");
  const canView = hasPermission("lab.view");

  const [order, setOrder] = useState<LabOrderDetail | null>(null);
  const [lines, setLines] = useState<Record<number, LineForm>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement | null>(null);
  /** Snapshot when the order was loaded (or last known server state); used to detect unsaved edits. */
  const baselineLinesRef = useRef<Record<number, LineForm>>({});

  const itemById = useMemo(() => {
    if (!order) return new Map<number, LabOrderDetail["items"][number]>();
    return new Map(order.items.map((it) => [it.id, it]));
  }, [order]);

  const formProgress = useMemo(() => {
    if (!order) return { total: 0, withEntry: 0, serverRecorded: 0 };
    let withEntry = 0;
    let serverRecorded = 0;
    for (const item of order.items) {
      const line = lines[item.id];
      const hasEntry = Boolean(line?.resultValue?.trim() || line?.resultUnit?.trim());
      if (hasEntry) withEntry++;
      if (item.status === "completed") serverRecorded++;
    }
    return { total: order.items.length, withEntry, serverRecorded };
  }, [order, lines]);

  const lineMeta = useMemo((): ResultRowModel[] => {
    if (!order) return [];
    const decorators = order.items.map((item, index) => {
      const categoryName = item.labTest.category?.name ?? "Uncategorized";
      const panelLabel = item.panelParentTest?.name ?? null;
      return {
        itemId: item.id,
        lineNo: index + 1,
        categoryName,
        panelLabel,
        testName: item.labTest.name,
        normalRange: item.labTest.normalRange?.trim() ? item.labTest.normalRange : "—",
        unit: item.labTest.unit?.trim() ? item.labTest.unit : "—",
        unitPrice: item.unitPrice,
        status: item.status,
      };
    });
    return decorators;
  }, [order]);

  const groupedRows = useMemo(() => {
    return groupLabOrderRowsByCategoryAndPanel(lineMeta);
  }, [lineMeta]);

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
      if (cancelled) return;
      setOrder(data);
      const next: Record<number, LineForm> = {};
      for (const it of data.items) {
        next[it.id] = {
          resultValue: it.resultValue ?? "",
          resultUnit: it.resultUnit ?? it.labTest.unit ?? "",
          notes: it.notes ?? "",
        };
      }
      baselineLinesRef.current = JSON.parse(JSON.stringify(next)) as Record<number, LineForm>;
      setLines(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error]);

  useEffect(() => {
    if (!order || !canEdit || order.status === "cancelled") return;
    const o = order;
    const currentLines = lines;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!linesAreDirty(o, currentLines, baselineLinesRef.current)) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [order, lines, canEdit]);

  const tryNavigateToOrders = useCallback(async () => {
    if (!order || order.status === "cancelled" || !canEdit) {
      router.push("/lab/orders");
      return;
    }
    if (!linesAreDirty(order, lines, baselineLinesRef.current)) {
      router.push("/lab/orders");
      return;
    }
    const res = await Swal.fire({
      icon: "warning",
      title: "Discard unsaved data?",
      text: "You have result or note fields that are not saved. Return to the list and lose your changes?",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "No",
      reverseButtons: true,
    });
    if (res.isConfirmed) router.push("/lab/orders");
  }, [order, lines, canEdit, router]);

  function updateLine(itemId: number, patch: Partial<LineForm>) {
    setLines((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !canEdit) return;
    setError("");
    setSaving(true);
    try {
      const outcomes = await Promise.all(
        order.items.map(async (item) => {
          const line = lines[item.id];
          if (!line) return { ok: true as const };
          const rv = line.resultValue.trim();
          const ru = line.resultUnit.trim();
          const nt = line.notes.trim();
          const status = rv || ru ? "completed" : "pending";
          const res = await authFetch(`/api/lab/orders/${order.id}/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resultValue: rv || null,
              resultUnit: ru || null,
              notes: nt || null,
              status,
            }),
          });
          if (!res.ok) {
            let msg = "Save failed";
            try {
              const j = (await res.json()) as { error?: string };
              if (typeof j.error === "string") msg = j.error;
            } catch {
              /* ignore */
            }
            return { ok: false as const, error: msg };
          }
          return { ok: true as const };
        })
      );
      const failed = outcomes.find((o) => "ok" in o && o.ok === false);
      if (failed && "error" in failed) {
        setError(failed.error);
        return;
      }
      router.push("/lab/orders");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function handlePrintRequest() {
    if (!order) return;
    const items = toPrintItems(order, lines, lineMeta);
    printLabRequestSheet(printPayloadFromOrder(order, items, new Date().toISOString()));
  }

  function handlePrintAnswer() {
    if (!order) return;
    const items = toPrintItems(order, lines, lineMeta);
    printLabAnswerSheet(printPayloadFromOrder(order, items, new Date().toISOString()));
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab results" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab results" />
        <p className="mt-6 text-sm text-gray-500">Invalid order.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab results" />
        <p className="mt-6 text-sm text-gray-500">Order not found.</p>
        <Link href="/lab/orders" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const cancelledOrder = order.status === "cancelled";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageBreadCrumb pageTitle={`Lab results · Order #${order.id}`} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handlePrintRequest}>
            Print lab request
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handlePrintAnswer}>
            Print answer sheet
          </Button>
          {canEdit && !cancelledOrder ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void tryNavigateToOrders()}>
              Back to orders
            </Button>
          ) : (
            <Link href="/lab/orders">
              <Button type="button" variant="outline" size="sm">
                Back to orders
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Client</p>
            <p className="font-medium text-gray-900 dark:text-white">{order.patient.name}</p>
            <p className="text-gray-600 dark:text-gray-400">{order.patient.patientCode}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Doctor</p>
            <p className="text-gray-900 dark:text-white">{order.doctor.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Visit</p>
            <p className="text-gray-900 dark:text-white">
              {formatApptDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
            </p>
            <p className="text-gray-600 dark:text-gray-400">{order.appointment.branch.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Order</p>
            <p className="text-gray-900 dark:text-white">#{order.id}</p>
            <p className="mt-0.5 capitalize text-gray-600 dark:text-gray-400">{order.status}</p>
          </div>
        </div>
      </div>

      {error && (
        <div
          ref={errorRef}
          className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400"
          role="alert"
        >
          {error}
        </div>
      )}

      {cancelledOrder ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">This order was cancelled. Results cannot be edited.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Tests</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                By category and panel. Enter a result or unit to record a line; leave both empty to leave pending.
                {formProgress.total > 0 ? (
                  <>
                    {" "}
                    ({formProgress.withEntry} of {formProgress.total} with a value; {formProgress.serverRecorded} recorded
                    on save.)
                  </>
                ) : null}
              </p>
            </div>
            <div>
              {groupedRows.map((cat) => (
                <div key={cat.categoryName}>
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900/40">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">{cat.categoryName}</h3>
                  </div>
                  <div>
                    {cat.segments.map((seg, segIdx) => (
                      <div key={`${cat.categoryName}-${seg.panelLabel ?? "standalone"}-${segIdx}`}>
                        {seg.panelLabel ? (
                          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-1.5 dark:border-gray-800 dark:bg-gray-900/30">
                            <p className="text-xs text-gray-600 dark:text-gray-400">Panel: {seg.panelLabel}</p>
                          </div>
                        ) : null}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {seg.rows.map((meta) => {
                            const item = itemById.get(meta.itemId);
                            if (!item) return null;
                            const line = lines[item.id] ?? { resultValue: "", resultUnit: "", notes: "" };
                            const rangeText = item.labTest.normalRange?.trim() ? item.labTest.normalRange : "—";
                            const resultId = `lab-result-${item.id}`;
                            const unitId = `lab-unit-${item.id}`;
                            const notesId = `lab-notes-${item.id}`;
                            return (
                              <div key={item.id} className="grid gap-4 px-4 py-4 sm:grid-cols-12 lg:items-start">
                                <div className="sm:col-span-12 lg:col-span-3">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    #{meta.lineNo} · {item.status === "completed" ? "Recorded" : "Pending"}
                                  </p>
                                  <p className="mt-0.5 font-medium text-gray-900 dark:text-white">{item.labTest.name}</p>
                                </div>
                                <div className="grid gap-3 sm:col-span-12 sm:grid-cols-2 lg:col-span-9 lg:grid-cols-12 lg:gap-x-3 lg:gap-y-3">
                                  {canEdit ? (
                                    <>
                                      <div className="sm:col-span-1 lg:col-span-3">
                                        <Label htmlFor={resultId}>Result</Label>
                                        <input
                                          id={resultId}
                                          type="text"
                                          value={line.resultValue}
                                          onChange={(e) => updateLine(item.id, { resultValue: e.target.value })}
                                          enterKeyHint="next"
                                          className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                          placeholder="Value"
                                          autoComplete="off"
                                        />
                                      </div>
                                      <div className="sm:col-span-1 lg:col-span-3">
                                        <Label htmlFor={unitId}>Unit</Label>
                                        <input
                                          id={unitId}
                                          type="text"
                                          value={line.resultUnit}
                                          onChange={(e) => updateLine(item.id, { resultUnit: e.target.value })}
                                          enterKeyHint="done"
                                          className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                          placeholder={item.labTest.unit || "Unit"}
                                          autoComplete="off"
                                        />
                                      </div>
                                      <div className="sm:col-span-2 lg:col-span-6">
                                        <p className="mb-1 text-sm text-gray-700 dark:text-gray-400">Normal range</p>
                                        <p className="min-h-10 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200">
                                          {rangeText}
                                        </p>
                                      </div>
                                      <div className="sm:col-span-2 lg:col-span-12">
                                        <Label htmlFor={notesId}>Notes</Label>
                                        <input
                                          id={notesId}
                                          type="text"
                                          value={line.notes}
                                          onChange={(e) => updateLine(item.id, { notes: e.target.value })}
                                          className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                                          placeholder="Optional"
                                          autoComplete="off"
                                        />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="sm:col-span-2 lg:col-span-12">
                                      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-3">
                                        <div className="lg:col-span-3">
                                          <dt className="text-xs text-gray-500 dark:text-gray-400">Result</dt>
                                          <dd className="mt-0.5 text-gray-900 dark:text-white">
                                            {line.resultValue.trim() || "—"}
                                          </dd>
                                        </div>
                                        <div className="lg:col-span-3">
                                          <dt className="text-xs text-gray-500 dark:text-gray-400">Unit</dt>
                                          <dd className="mt-0.5 text-gray-900 dark:text-white">{line.resultUnit.trim() || "—"}</dd>
                                        </div>
                                        <div className="sm:col-span-2 lg:col-span-6">
                                          <dt className="text-xs text-gray-500 dark:text-gray-400">Normal range</dt>
                                          <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{rangeText}</dd>
                                        </div>
                                        <div className="sm:col-span-2 lg:col-span-12">
                                          <dt className="text-xs text-gray-500 dark:text-gray-400">Notes</dt>
                                          <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{line.notes.trim() || "—"}</dd>
                                        </div>
                                      </dl>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => void tryNavigateToOrders()}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save and return"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">You need lab edit permission to enter or change results.</p>
          )}
        </form>
      )}
    </div>
  );
}
