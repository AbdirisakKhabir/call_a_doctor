"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CalenderIcon, UserCircleIcon, PencilIcon, CheckLineIcon, ListIcon, DollarLineIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type LabOrder = {
  id: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string };
  items: {
    id: number;
    unitPrice: number;
    resultValue: string | null;
    resultUnit: string | null;
    status: string;
    labTest: { id: number; name: string; unit: string | null; normalRange: string | null; price: number };
  }[];
};

type LabTest = { id: number; name: string; price: number; category: { name: string } };

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function LabOrdersPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const createFrom = searchParams.get("create") === "1" ? { appointmentId: searchParams.get("appointmentId"), patientId: searchParams.get("patientId"), doctorId: searchParams.get("doctorId") } : null;

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const orderPageSize = 20;
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingItem, setRecordingItem] = useState<{ orderId: number; itemId: number } | null>(null);
  const [resultForm, setResultForm] = useState({ resultValue: "", resultUnit: "", notes: "" });
  const [createModal, setCreateModal] = useState(!!createFrom);
  const [createForm, setCreateForm] = useState({ notes: "", testIds: [] as number[] });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [testSearch, setTestSearch] = useState("");

  const canRecord = hasPermission("lab.edit");
  const canCreate = hasPermission("lab.create");

  const selectedLabFee = useMemo(() => {
    return createForm.testIds.reduce((sum, id) => {
      const t = tests.find((x) => x.id === id);
      return sum + (t?.price ?? 0);
    }, 0);
  }, [createForm.testIds, tests]);

  const selectedTestsOrdered = useMemo(() => {
    return createForm.testIds
      .map((id) => tests.find((t) => t.id === id))
      .filter((t): t is LabTest => Boolean(t));
  }, [createForm.testIds, tests]);

  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => {
      const cat = t.category.name.toLowerCase();
      return t.name.toLowerCase().includes(q) || cat.includes(q);
    });
  }, [tests, testSearch]);

  useEffect(() => {
    if (!createModal) setTestSearch("");
  }, [createModal]);

  async function loadOrders() {
    const params = new URLSearchParams({ page: String(orderPage), pageSize: String(orderPageSize) });
    const oRes = await authFetch(`/api/lab/orders?${params}`);
    if (oRes.ok) {
      const body = await oRes.json();
      setOrders(body.data ?? []);
      setOrderTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadTests() {
    const tRes = await authFetch("/api/lab/tests");
    if (tRes.ok) {
      const data = await tRes.json();
      setTests(Array.isArray(data) ? data : data.data ?? []);
    }
  }

  useEffect(() => {
    loadTests();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadOrders().finally(() => setLoading(false));
  }, [orderPage]);

  async function handleCreateOrder() {
    if (!createFrom?.appointmentId || !createFrom?.patientId || !createFrom?.doctorId || createForm.testIds.length === 0) return;
    setCreateSubmitting(true);
    try {
      const res = await authFetch("/api/lab/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: Number(createFrom.appointmentId),
          patientId: Number(createFrom.patientId),
          doctorId: Number(createFrom.doctorId),
          notes: createForm.notes || null,
          testIds: createForm.testIds,
        }),
      });
      if (res.ok) {
        setCreateForm({ notes: "", testIds: [] });
        setTestSearch("");
        setCreateModal(false);
        await loadOrders();
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/lab/orders");
      } else {
        alert((await res.json()).error || "Failed");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  function toggleTest(id: number) {
    setCreateForm((f) => ({
      ...f,
      testIds: f.testIds.includes(id) ? f.testIds.filter((x) => x !== id) : [...f.testIds, id],
    }));
  }

  function removeTest(id: number) {
    setCreateForm((f) => ({ ...f, testIds: f.testIds.filter((x) => x !== id) }));
  }

  function closeCreateModal() {
    setCreateModal(false);
    setTestSearch("");
    if (typeof window !== "undefined") window.history.replaceState({}, "", "/lab/orders");
  }

  function openRecord(orderId: number, item: { id: number; resultValue: string | null; resultUnit: string | null; labTest: { unit: string | null } }) {
    setRecordingItem({ orderId, itemId: item.id });
    setResultForm({ resultValue: item.resultValue ?? "", resultUnit: item.resultUnit ?? item.labTest.unit ?? "", notes: "" });
  }

  async function saveResult() {
    if (!recordingItem) return;
    const res = await authFetch(`/api/lab/orders/${recordingItem.orderId}/items/${recordingItem.itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultValue: resultForm.resultValue || null, resultUnit: resultForm.resultUnit || null, status: resultForm.resultValue ? "completed" : "pending", notes: resultForm.notes || null }),
    });
    if (res.ok) {
      setRecordingItem(null);
      await loadOrders();
    } else {
      alert((await res.json()).error || "Failed");
    }
  }

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab Orders" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Lab Orders" />
        {canCreate && createFrom && (
          <Button size="sm" onClick={() => setCreateModal(true)}>New Lab Order</Button>
        )}
      </div>

      {createModal && createFrom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] overflow-y-auto">
          <div
            className="my-6 w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:border-gray-700/80 dark:bg-gray-900 dark:shadow-black/40"
            role="dialog"
            aria-labelledby="lab-order-modal-title"
            aria-modal="true"
          >
            <div className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-brand-500/12 via-white to-violet-500/5 px-6 py-5 dark:border-gray-800 dark:from-brand-500/20 dark:via-gray-900 dark:to-violet-500/10">
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-400/20 blur-3xl dark:bg-brand-500/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-brand-500/15 dark:bg-gray-800 dark:ring-brand-500/25">
                    <ListIcon className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-brand-600/90 dark:text-brand-400/90">New lab order</p>
                    <h2 id="lab-order-modal-title" className="mt-0.5 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                      Choose tests
                    </h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      Search the catalog, select multiple tests, and review the ordered list. Fees are summed and added to the client&apos;s account balance.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  <span className="text-2xl leading-none">×</span>
                </button>
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-2 md:gap-8">
              <div className="flex min-h-0 flex-col">
                <Label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Browse &amp; search</Label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    placeholder="Search by test name or category…"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50/80 pl-10 pr-4 text-sm outline-none transition-shadow placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500 dark:focus:bg-gray-900"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {filteredTests.length} of {tests.length} tests
                  {testSearch.trim() ? ` matching “${testSearch.trim()}”` : ""}
                </p>
                <div className="mt-3 flex max-h-[min(320px,50vh)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50/90 to-white dark:border-gray-700 dark:from-gray-800/40 dark:to-gray-900/80">
                  <div className="overflow-y-auto overscroll-contain p-2">
                    {filteredTests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tests match your search.</p>
                        <button
                          type="button"
                          onClick={() => setTestSearch("")}
                          className="mt-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Clear search
                        </button>
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {filteredTests.map((t) => {
                          const checked = createForm.testIds.includes(t.id);
                          return (
                            <li key={t.id}>
                              <label
                                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                                  checked
                                    ? "bg-brand-50 ring-1 ring-brand-200/80 dark:bg-brand-500/15 dark:ring-brand-500/30"
                                    : "hover:bg-white dark:hover:bg-gray-800/70"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleTest(t.id)}
                                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{t.category.name}</p>
                                </div>
                                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                  ${(t.price ?? 0).toFixed(2)}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Selected tests</Label>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {createForm.testIds.length} in list
                  </span>
                </div>
                <div className="mt-2 flex min-h-[min(320px,50vh)] flex-col overflow-hidden rounded-xl border-2 border-dashed border-brand-200/70 bg-brand-50/30 dark:border-brand-500/25 dark:bg-brand-500/5">
                  {selectedTestsOrdered.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                      <ListIcon className="h-10 w-10 text-brand-300 dark:text-brand-600/50" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tests selected yet</p>
                      <p className="max-w-[220px] text-xs text-gray-400 dark:text-gray-500">Use the list on the left to add one or more tests to this order.</p>
                    </div>
                  ) : (
                    <ol className="flex-1 list-none overflow-y-auto overscroll-contain p-3">
                      {selectedTestsOrdered.map((t, index) => (
                        <li
                          key={t.id}
                          className="mb-2 flex items-center gap-3 rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 shadow-sm last:mb-0 dark:border-gray-700 dark:bg-gray-800/90"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-500/25 dark:text-brand-200">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                            <p className="truncate text-xs text-gray-500">{t.category.name}</p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">${(t.price ?? 0).toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => removeTest(t.id)}
                            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10 dark:hover:text-error-400"
                            aria-label={`Remove ${t.name}`}
                          >
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-200/60 bg-gradient-to-r from-brand-50 to-white px-4 py-3 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-gray-900/50">
                  <div className="flex items-center gap-2 text-brand-800 dark:text-brand-200">
                    <DollarLineIcon className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">Lab fee total</span>
                  </div>
                  <span className="font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-white">${selectedLabFee.toFixed(2)}</span>
                </div>
                <p className="mt-2 text-xs leading-snug text-gray-500 dark:text-gray-400">
                  Charged to the client&apos;s balance when you create this order.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/50">
              <Label className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notes for the lab (optional)</Label>
              <textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="Clinical context, fasting, urgency…"
              />
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <Button variant="outline" size="sm" onClick={closeCreateModal}>
                  Cancel
                </Button>
                <Button size="sm" disabled={createSubmitting || createForm.testIds.length === 0} onClick={handleCreateOrder}>
                  {createSubmitting ? "Creating…" : `Create order${createForm.testIds.length > 0 ? ` (${createForm.testIds.length})` : ""}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm font-medium">Loading lab orders...</p>
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/10">
              <CalenderIcon className="h-10 w-10 text-brand-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No lab orders yet</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Lab orders are created from appointments. Click an appointment to send a client to the lab.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white px-6 py-4 dark:border-gray-800 dark:from-gray-900/50 dark:to-transparent">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 dark:bg-brand-500/20">
                      <UserCircleIcon className="h-6 w-6 text-brand-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{order.patient.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {order.patient.patientCode} · Dr. {order.doctor.name}
                      </p>
                    </div>
                  </div>
                    <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <CalenderIcon className="h-4 w-4" />
                      {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
                    </div>
                    <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-sm font-semibold text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                      Lab fee: ${(order.totalAmount ?? 0).toFixed(2)}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      order.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {order.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-4 px-6 py-4 dark:bg-white/[0.01]">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{item.labTest.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Fee: ${(item.unitPrice ?? 0).toFixed(2)}
                      </p>
                      {item.labTest.normalRange && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Ref: {item.labTest.normalRange}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {recordingItem?.itemId === item.id ? (
                        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2 dark:border-brand-500/30 dark:bg-brand-500/10">
                          <input value={resultForm.resultValue} onChange={(e) => setResultForm((f) => ({ ...f, resultValue: e.target.value }))} placeholder="Result" className="h-9 w-28 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          <input value={resultForm.resultUnit} onChange={(e) => setResultForm((f) => ({ ...f, resultUnit: e.target.value }))} placeholder="Unit" className="h-9 w-20 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          <button onClick={saveResult} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
                            <CheckLineIcon className="h-4 w-4" /> Save
                          </button>
                          <button onClick={() => setRecordingItem(null)} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className={`min-w-[80px] rounded-lg px-3 py-1.5 text-sm font-medium ${
                            item.status === "completed" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          }`}>
                            {item.resultValue || "—"} {item.resultUnit && item.resultValue ? item.resultUnit : ""}
                          </span>
                          {canRecord && (
                            <button onClick={() => openRecord(order.id, item)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                              <PencilIcon className="h-4 w-4" /> {item.status === "completed" ? "Edit" : "Record"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <ListPaginationFooter
            loading={loading}
            total={orderTotal}
            page={orderPage}
            pageSize={orderPageSize}
            noun="orders"
            onPageChange={setOrderPage}
          />
        </div>
      )}
    </>
  );
}
