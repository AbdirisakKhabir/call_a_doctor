"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CalenderIcon, UserCircleIcon, PencilIcon, CheckLineIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type LabOrder = {
  id: number;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string };
  items: { id: number; resultValue: string | null; resultUnit: string | null; status: string; labTest: { id: number; name: string; unit: string | null; normalRange: string | null } }[];
};

type LabTest = { id: number; name: string; category: { name: string } };

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

  const canRecord = hasPermission("lab.edit");
  const canCreate = hasPermission("lab.create");

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
        setCreateModal(false);
        setCreateForm({ notes: "", testIds: [] });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg my-8 rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Lab Order</h2>
              <button type="button" onClick={() => { setCreateModal(false); window.history.replaceState({}, "", "/lab/orders"); }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >×</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">Select tests to order for this patient.</p>
              <div>
                <Label>Tests</Label>
                <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/30">
                  {tests.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg cursor-pointer hover:bg-white dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-brand-500/20 dark:hover:border-brand-500/20">
                      <input type="checkbox" checked={createForm.testIds.includes(t.id)} onChange={() => toggleTest(t.id)} className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{t.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">({t.category.name})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Optional notes..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setCreateModal(false); window.history.replaceState({}, "", "/lab/orders"); }}>Cancel</Button>
                <Button size="sm" disabled={createSubmitting || createForm.testIds.length === 0} onClick={handleCreateOrder}>{createSubmitting ? "Creating..." : "Create Order"}</Button>
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
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Lab orders are created from appointments. Click an appointment to send a patient to the lab.</p>
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
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <CalenderIcon className="h-4 w-4" />
                      {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
                    </div>
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
