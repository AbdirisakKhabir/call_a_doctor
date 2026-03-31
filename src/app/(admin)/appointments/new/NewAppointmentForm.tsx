"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import DateField from "@/components/form/DateField";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string; specialty: string | null; branch: { id: number } | null };
type Service = { id: number; name: string; price: number };
type Patient = { id: number; patientCode: string; name: string };

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

export default function NewAppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const { hasPermission } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    branchId: "",
    doctorId: "",
    patientId: "",
    appointmentDate: "",
    startTime: "09:00",
    endTime: "09:30",
    notes: "",
    services: [] as { serviceId: number; name: string; quantity: number; unitPrice: number }[],
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");

  useEffect(() => {
    const initialDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);
    setForm((f) => ({ ...f, appointmentDate: initialDate }));
  }, [dateParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [brRes, drRes, svcRes] = await Promise.all([
        authFetch("/api/branches"),
        authFetch("/api/doctors"),
        authFetch("/api/services"),
      ]);
      if (cancelled) return;
      if (brRes.ok) {
        const list: Branch[] = await brRes.json();
        setBranches(list);
        setForm((f) => ({ ...f, branchId: f.branchId || (list[0] ? String(list[0].id) : "") }));
      }
      if (drRes.ok) setDoctors(await drRes.json());
      if (svcRes.ok) setServices(await svcRes.json());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = patientSearch.trim();
    if (q.length < 2) {
      setPatientSearchResults([]);
      setSearchingPatients(false);
      return;
    }
    setSearchingPatients(true);
    const t = setTimeout(() => {
      authFetch(`/api/patients?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Patient[] | unknown) => {
          setPatientSearchResults(Array.isArray(data) ? data : []);
        })
        .catch(() => setPatientSearchResults([]))
        .finally(() => setSearchingPatients(false));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  function addService(s: Service) {
    const existing = form.services.find((x) => x.serviceId === s.id);
    if (existing) return;
    setForm((f) => ({
      ...f,
      services: [...f.services, { serviceId: s.id, name: s.name, quantity: 1, unitPrice: s.price }],
    }));
  }

  function removeService(serviceId: number) {
    setForm((f) => ({ ...f, services: f.services.filter((x) => x.serviceId !== serviceId) }));
  }

  function updateServiceQty(serviceId: number, quantity: number) {
    setForm((f) => ({
      ...f,
      services: f.services.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, quantity) } : s)),
    }));
  }

  function updateServicePrice(serviceId: number, unitPrice: number) {
    setForm((f) => ({
      ...f,
      services: f.services.map((s) => (s.serviceId === serviceId ? { ...s, unitPrice } : s)),
    }));
  }

  const totalCharge = form.services.reduce((s, x) => s + x.quantity * x.unitPrice, 0);

  const filteredDoctors = form.branchId
    ? doctors.filter((d) => !d.branch || d.branch.id === Number(form.branchId))
    : doctors;

  const selectedPatientLabel =
    form.patientId &&
    (patientSearchResults.find((p) => p.id === Number(form.patientId))?.name ||
      patientSearch);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!canCreate) return;
    if (!form.branchId || !form.doctorId || !form.patientId) {
      setError("Branch, doctor and patient are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(form.branchId),
          doctorId: Number(form.doctorId),
          patientId: Number(form.patientId),
          appointmentDate: form.appointmentDate,
          startTime: form.startTime,
          endTime: form.endTime,
          notes: form.notes || null,
          services: form.services.map((s) => ({ serviceId: s.serviceId, quantity: s.quantity, unitPrice: s.unitPrice })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create appointment");
        return;
      }
      router.push("/appointments");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New appointment" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission to create appointments.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New appointment" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-gray-600 dark:text-gray-400">Add at least one branch in Settings before creating appointments.</p>
          <Button className="mt-4" size="sm" onClick={() => router.push("/settings/branches")}>
            Branches & access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New appointment" />
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/appointments")}>
          Back to calendar
        </Button>
      </div>

      <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Branch *</label>
              <select
                required
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value, doctorId: "" }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Doctor *</label>
              <select
                required
                value={form.doctorId}
                onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select doctor</option>
                {filteredDoctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Patient *</label>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Search by name, patient code, phone, or email — at least 2 characters.</p>
            <input
              type="text"
              placeholder="Search patient…"
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                if (!e.target.value.trim()) setForm((f) => ({ ...f, patientId: "" }));
              }}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {patientSearch.trim().length < 2 ? (
                <p className="px-4 py-3 text-sm text-gray-500">Type at least 2 characters to search.</p>
              ) : searchingPatients ? (
                <p className="px-4 py-3 text-sm text-gray-500">Searching…</p>
              ) : patientSearchResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">No patients found.</p>
              ) : (
                patientSearchResults.slice(0, 15).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, patientId: String(p.id) }));
                      setPatientSearch(`${p.name} (${p.patientCode})`);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      form.patientId === String(p.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-gray-500">{p.patientCode}</span>
                  </button>
                ))
              )}
            </div>
            {form.patientId && selectedPatientLabel && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">Selected: {selectedPatientLabel}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DateField
              id="appointment-date"
              label="Date *"
              required
              value={form.appointmentDate}
              onChange={(v) => setForm((f) => ({ ...f, appointmentDate: v }))}
              appendToBody
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Start time *</label>
              <select
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">End time</label>
              <select
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Services (charge patient)</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {services
                .filter((s) => !form.services.some((x) => x.serviceId === s.id))
                .map((s) => (
                  <Button key={s.id} type="button" variant="outline" size="sm" onClick={() => addService(s)}>
                    + {s.name} (${s.price})
                  </Button>
                ))}
            </div>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              {form.services.map((s) => (
                <div key={s.serviceId} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm">{s.name}</span>
                  <input
                    type="number"
                    min="1"
                    value={s.quantity}
                    onChange={(e) => updateServiceQty(s.serviceId, Number(e.target.value))}
                    className="h-9 w-16 rounded border px-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={s.unitPrice}
                    onChange={(e) => updateServicePrice(s.serviceId, Number(e.target.value))}
                    className="h-9 w-20 rounded border px-2 text-sm"
                  />
                  <span className="text-sm font-medium">${(s.quantity * s.unitPrice).toFixed(2)}</span>
                  <button type="button" onClick={() => removeService(s.serviceId)} className="text-error-500 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              {form.services.length > 0 && <div className="border-t pt-2 font-semibold">Total: ${totalCharge.toFixed(2)}</div>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/appointments")} size="sm">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Creating…" : "Create appointment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
