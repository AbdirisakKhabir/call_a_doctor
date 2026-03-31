"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CalenderIcon, UserCircleIcon, BoxCubeIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Prescription = {
  id: number;
  isEmergency?: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string };
  items: {
    id: number;
    quantity: number;
    dosage: string | null;
    instructions: string | null;
    product: { id: number; name: string; code: string; sellingPrice?: number };
  }[];
};

type Product = { id: number; name: string; code: string; quantity: number };

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function PrescriptionsPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const createFrom =
    searchParams.get("create") === "1"
      ? {
          appointmentId: searchParams.get("appointmentId"),
          patientId: searchParams.get("patientId"),
          doctorId: searchParams.get("doctorId"),
          branchId: searchParams.get("branchId"),
        }
      : null;

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [rxTotal, setRxTotal] = useState(0);
  const [rxPage, setRxPage] = useState(1);
  const rxPageSize = 20;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(!!createFrom);
  const [rxListFilter, setRxListFilter] = useState<"all" | "emergency" | "clinic">("all");
  const [createForm, setCreateForm] = useState({
    notes: "",
    isEmergency: false,
    items: [] as { productId: number; name: string; quantity: number; dosage: string; instructions: string }[],
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const canCreate = hasPermission("prescriptions.create");

  async function fetchPrescriptionsPage(page: number) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(rxPageSize),
    });
    if (rxListFilter === "emergency") params.set("emergency", "yes");
    if (rxListFilter === "clinic") params.set("emergency", "no");
    const pRes = await authFetch(`/api/prescriptions?${params}`);
    if (!pRes.ok) return;
    const body = await pRes.json();
    if (Array.isArray(body)) {
      setPrescriptions(body);
      setRxTotal(body.length);
    } else {
      setPrescriptions(body.data ?? []);
      setRxTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadProducts() {
    const bid = createFrom?.branchId;
    if (bid) {
      const prodRes = await authFetch(
        `/api/pharmacy/products?branchId=${encodeURIComponent(bid)}&stockType=sale`
      );
      if (prodRes.ok) {
        const raw = await prodRes.json();
        const arr = Array.isArray(raw) ? raw : raw.data ?? [];
        setProducts(arr.filter((p: Product) => p.quantity > 0));
      }
    } else {
      setProducts([]);
    }
  }

  useEffect(() => {
    loadProducts();
  }, [createFrom?.branchId]);

  useEffect(() => {
    setLoading(true);
    fetchPrescriptionsPage(rxPage).finally(() => setLoading(false));
  }, [rxPage, rxListFilter]);

  function addProduct(p: Product) {
    if (createForm.items.some((i) => i.productId === p.id)) return;
    setCreateForm((f) => ({ ...f, items: [...f.items, { productId: p.id, name: p.name, quantity: 1, dosage: "", instructions: "" }] }));
  }

  function removeProduct(productId: number) {
    setCreateForm((f) => ({ ...f, items: f.items.filter((i) => i.productId !== productId) }));
  }

  function updateItem(productId: number, field: string, value: string | number) {
    setCreateForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)),
    }));
  }

  async function handleCreatePrescription() {
    if (!createFrom?.appointmentId || !createFrom?.patientId || !createFrom?.doctorId || createForm.items.length === 0) return;
    setCreateSubmitting(true);
    try {
      const res = await authFetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: Number(createFrom.appointmentId),
          patientId: Number(createFrom.patientId),
          doctorId: Number(createFrom.doctorId),
          isEmergency: createForm.isEmergency,
          notes: createForm.notes || null,
          items: createForm.items.map((i) => ({ productId: i.productId, quantity: i.quantity, dosage: i.dosage || undefined, instructions: i.instructions || undefined })),
        }),
      });
      if (res.ok) {
        setCreateModal(false);
        setCreateForm({ notes: "", isEmergency: false, items: [] });
        setRxPage(1);
        await fetchPrescriptionsPage(1);
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/prescriptions");
      } else {
        alert((await res.json()).error || "Failed");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  if (!hasPermission("prescriptions.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Prescriptions" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Prescriptions" />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rxListFilter}
            onChange={(e) => {
              setRxListFilter(e.target.value as "all" | "emergency" | "clinic");
              setRxPage(1);
            }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            aria-label="Filter prescriptions"
          >
            <option value="all">All prescriptions</option>
            <option value="emergency">Emergency only</option>
            <option value="clinic">Clinic visits only</option>
          </select>
          {hasPermission("pharmacy.view") && (
            <Link
              href="/pharmacy/patient-invoice"
              className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Patient invoice
            </Link>
          )}
          {canCreate && createFrom && (
            <Button size="sm" onClick={() => setCreateModal(true)}>New Prescription</Button>
          )}
        </div>
      </div>

      {createModal && createFrom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl my-8 rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Prescription</h2>
              <button type="button" onClick={() => { setCreateModal(false); window.history.replaceState({}, "", "/prescriptions"); }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >×</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">Select products from inventory to prescribe.</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={createForm.isEmergency}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isEmergency: e.target.checked }))}
                  className="rounded border-gray-300 text-brand-600"
                />
                <span>Emergency prescription (multiple allowed per patient; filter on Patient invoice)</span>
              </label>
              <div>
                <Label>Add Product</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {products.filter((p) => !createForm.items.some((i) => i.productId === p.id)).map((p) => (
                    <button key={p.id} type="button" onClick={() => addProduct(p)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-transparent transition-all hover:border-brand-500/50 hover:bg-brand-50/50 hover:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10">
                      <PlusIcon className="h-4 w-4" /> {p.name} <span className="text-gray-500">({p.code})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Prescribed Items ({createForm.items.length})</Label>
                <div className="mt-2 space-y-3">
                  {createForm.items.map((item) => (
                    <div key={item.productId} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex-1 font-medium text-gray-900 dark:text-white">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.productId, "quantity", Number(e.target.value))} className="h-9 w-16 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          <input placeholder="Dosage" value={item.dosage} onChange={(e) => updateItem(item.productId, "dosage", e.target.value)} className="h-9 w-32 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          <input placeholder="Instructions" value={item.instructions} onChange={(e) => updateItem(item.productId, "instructions", e.target.value)} className="h-9 min-w-[140px] flex-1 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          <button type="button" onClick={() => removeProduct(item.productId)} className="rounded-lg p-2 text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10">
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Optional notes..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setCreateModal(false); window.history.replaceState({}, "", "/prescriptions"); }}>Cancel</Button>
                <Button size="sm" disabled={createSubmitting || createForm.items.length === 0} onClick={handleCreatePrescription}>{createSubmitting ? "Creating..." : "Create Prescription"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col items-center justify-center gap-4 text-gray-500 dark:text-gray-400">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm font-medium">Loading prescriptions...</p>
          </div>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 dark:border-gray-800 dark:bg-white/3">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/10">
              <BoxCubeIcon className="h-10 w-10 text-brand-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No prescriptions yet</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Prescriptions are created from appointments. Click an appointment to prescribe medications from inventory.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/[0.02]">
              <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white px-5 py-4 dark:border-gray-800 dark:from-gray-900/50 dark:to-transparent">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 dark:bg-brand-500/20">
                      <UserCircleIcon className="h-5 w-5 text-brand-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-gray-900 dark:text-white">{rx.patient.name}</h3>
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {rx.patient.patientCode} · Dr. {rx.doctor.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {rx.isEmergency && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                          Emergency
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                          rx.status === "dispensed"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        {rx.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <CalenderIcon className="h-4 w-4 shrink-0" />
                    {formatDate(rx.appointment.appointmentDate)} · {rx.appointment.startTime}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 flex-col px-5 py-4">
                {rx.notes && (
                  <p className="mb-3 line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">{rx.notes}</p>
                )}
                <div className="space-y-2">
                  {rx.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-white/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/30">
                      <BoxCubeIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900 dark:text-white">{item.product.name}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{item.product.code}</span>
                          <span>× {item.quantity}</span>
                          {item.dosage && <span>· {item.dosage}</span>}
                          {item.instructions && <span className="line-clamp-1">· {item.instructions}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <ListPaginationFooter
            loading={loading}
            total={rxTotal}
            page={rxPage}
            pageSize={rxPageSize}
            noun="prescriptions"
            onPageChange={setRxPage}
          />
        </div>
      )}
    </>
  );
}
