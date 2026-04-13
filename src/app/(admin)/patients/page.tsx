"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import PatientPaymentModal from "@/components/patients/PatientPaymentModal";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Patient = {
  id: number;
  patientCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  notes: string | null;
  accountBalance?: number;
};

type Doctor = { id: number; name: string };

type HistoryEntry = {
  id: number;
  type: string;
  notes: string;
  createdAt: string;
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string } | null;
};

function historyTypeLabel(t: string) {
  const map: Record<string, string> = {
    chief_complaint: "Chief complaint",
    history: "History",
    examination: "Examination",
    diagnosis: "Diagnosis",
    notes: "Notes",
  };
  return map[t] || t;
}

export default function PatientsPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const historyParams = useMemo(
    () =>
      searchParams.get("history") === "1"
        ? { patientId: searchParams.get("patientId"), appointmentId: searchParams.get("appointmentId") }
        : null,
    [searchParams]
  );

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [historyModal, setHistoryModal] = useState(false);
  const [historyForm, setHistoryForm] = useState({ type: "notes", notes: "" });
  const [historyDoctorId, setHistoryDoctorId] = useState("");
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyPrior, setHistoryPrior] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySubmitting, setHistorySubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentPatient, setPaymentPatient] = useState<Patient | null>(null);

  const canCreate = hasPermission("patients.create") || hasPermission("pharmacy.create");
  const canEdit = hasPermission("patients.edit") || hasPermission("pharmacy.edit");
  const canDelete = hasPermission("patients.delete") || hasPermission("pharmacy.delete");
  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");
  const canClinicalNote =
    hasPermission("patient_history.create") || hasPermission("patient_history.view");

  async function loadPatients() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/patients?${params}`);
    if (res.ok) {
      const body = await res.json();
      setPatients(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setHistoryModal(!!historyParams);
  }, [historyParams]);

  useEffect(() => {
    const pid = historyParams?.patientId;
    if (!pid) return;
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      const [drRes, ptRes, hiRes] = await Promise.all([
        authFetch("/api/doctors"),
        authFetch(`/api/patients/${pid}`),
        authFetch(`/api/patient-history?patientId=${encodeURIComponent(pid)}`),
      ]);
      if (cancelled) return;
      if (drRes.ok) {
        const d = await drRes.json();
        setDoctors(Array.isArray(d) ? d : []);
      }
      if (ptRes.ok) {
        const p = await ptRes.json();
        setHistoryPatient(p);
      } else {
        setHistoryPatient(null);
      }
      if (hiRes.ok) {
        const list = await hiRes.json();
        setHistoryPrior(Array.isArray(list) ? list : []);
      } else {
        setHistoryPrior([]);
      }
    })().finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [historyParams?.patientId]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    loadPatients().finally(() => setLoading(false));
  }, [search, page]);

  function openPayment(p: Patient) {
    setPaymentPatient(p);
  }

  function closeHistoryModal() {
    setHistoryModal(false);
    setHistoryForm({ type: "notes", notes: "" });
    setHistoryDoctorId("");
    setHistoryPatient(null);
    setHistoryPrior([]);
    if (typeof window !== "undefined") window.history.replaceState({}, "", "/patients");
  }

  async function handleRecordHistory() {
    if (!historyParams?.patientId || !historyForm.notes.trim()) return;
    if (!historyDoctorId) {
      alert("Select a practitioner");
      return;
    }
    setHistorySubmitting(true);
    try {
      const res = await authFetch("/api/patient-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: Number(historyParams.patientId),
          appointmentId: historyParams.appointmentId ? Number(historyParams.appointmentId) : null,
          doctorId: Number(historyDoctorId),
          type: historyForm.type,
          notes: historyForm.notes.trim(),
        }),
      });
      if (res.ok) {
        closeHistoryModal();
      } else {
        alert((await res.json()).error || "Failed");
      }
    } finally {
      setHistorySubmitting(false);
    }
  }

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", phone: "", email: "", dateOfBirth: "", gender: "", address: "", notes: "" });
    setError("");
  }

  function openEdit(p: Patient) {
    setModal("edit");
    setEditingId(p.id);
    setForm({
      name: p.name,
      phone: p.phone ?? "",
      email: p.email ?? "",
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
      gender: p.gender ?? "",
      address: p.address ?? "",
      notes: p.notes ?? "",
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          return;
        }
        await loadPatients();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/patients/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update");
          return;
        }
        await loadPatients();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this patient?")) return;
    const res = await authFetch(`/api/patients/${id}`, { method: "DELETE" });
    if (res.ok) await loadPatients();
    else alert((await res.json()).error || "Failed to delete");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Patients" />
        {canCreate && (
          <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Patient</Button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">All Patients</h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {loading ? "…" : total}
            </span>
          </div>
          <input
            type="text"
            placeholder="Search by name, code, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64 rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No patients yet.</p>
            {canCreate && <Button className="mt-2" onClick={openAdd} size="sm">Add Patient</Button>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader>Email</TableCell>
                <TableCell isHeader>Gender</TableCell>
                <TableCell isHeader className="text-right">Balance</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.patientCode}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>{p.email || "—"}</TableCell>
                  <TableCell>{p.gender || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${(p.accountBalance ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {hasPermission("patients.view") && (
                        <Link
                          href={`/patients/${p.id}/history`}
                          className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                        >
                          History
                        </Link>
                      )}
                      {canClinicalNote && (
                        <Link
                          href={`/patients?history=1&patientId=${p.id}`}
                          className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Clinical note
                        </Link>
                      )}
                      {canRecordPayment && (p.accountBalance ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => openPayment(p)}
                          className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                        >
                          Pay
                        </button>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => openEdit(p)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10" aria-label="Edit">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(p.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10" aria-label="Delete">
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="patients"
          onPageChange={setPage}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "Add Patient" : "Edit Patient"}</h2>
              <button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div>
                <Label>Name *</Label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="+1234567890" />
                </div>
                <div>
                  <Label>Email</Label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="email@example.com" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DateField
                  id="patient-dob"
                  label="Date of Birth"
                  value={form.dateOfBirth}
                  onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                  appendToBody
                />
                <div>
                  <Label>Gender</Label>
                  <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Full address" />
              </div>
              <div>
                <Label>Patient chart notes (alerts / allergies)</Label>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Shown when booking and prescribing.</p>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Allergies, warnings, demographics…" />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : modal === "add" ? "Create" : "Update"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentPatient && (
        <PatientPaymentModal
          patient={paymentPatient}
          onClose={() => setPaymentPatient(null)}
          onSuccess={loadPatients}
        />
      )}

      {historyModal && historyParams && canClinicalNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold">Clinical note (treatment history)</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Document this encounter for the chart. When opened from the calendar, the note can be linked to that appointment.
                </p>
              </div>
              <button type="button" onClick={closeHistoryModal} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                ×
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {historyLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-800/40">
                    <p>
                      <span className="text-gray-500">Patient: </span>
                      <span className="font-medium">{historyPatient?.name ?? "—"}</span>
                      {historyPatient?.patientCode && (
                        <span className="ml-1 font-mono text-xs text-gray-500">({historyPatient.patientCode})</span>
                      )}
                    </p>
                    {historyParams.appointmentId && historyPatient && (
                      <p className="mt-1 text-xs text-gray-500">
                        Linked to appointment #{historyParams.appointmentId} (visit documentation).
                      </p>
                    )}
                    {historyPatient?.notes?.trim() && (
                      <p className="mt-2 border-t border-amber-200/80 pt-2 text-xs text-amber-950 dark:border-amber-900 dark:text-amber-100">
                        <span className="font-medium">Chart alerts on file: </span>
                        {historyPatient.notes}
                      </p>
                    )}
                  </div>
                  {historyPrior.length > 0 && (
                    <div>
                      <Label>Previous entries on chart</Label>
                      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Review past notes before adding a new one.</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-900/50">
                        {historyPrior.slice(0, 8).map((h) => (
                          <div key={h.id} className="rounded border border-gray-100 px-2 py-1.5 dark:border-gray-800">
                            <span className="font-medium text-gray-700 dark:text-gray-200">{historyTypeLabel(h.type)}</span>
                            <span className="text-gray-400"> · {h.doctor.name} · </span>
                            <span className="text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                            <p className="mt-0.5 line-clamp-3 text-gray-600 dark:text-gray-400">{h.notes}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Section</Label>
                    <select
                      value={historyForm.type}
                      onChange={(e) => setHistoryForm((f) => ({ ...f, type: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="chief_complaint">Chief complaint</option>
                      <option value="history">History</option>
                      <option value="examination">Examination</option>
                      <option value="diagnosis">Diagnosis</option>
                      <option value="notes">Clinical notes</option>
                    </select>
                  </div>
                  <div>
                    <Label>Practitioner *</Label>
                    <select
                      required
                      value={historyDoctorId}
                      onChange={(e) => setHistoryDoctorId(e.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="">Select practitioner</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Note text *</Label>
                    <textarea
                      required
                      value={historyForm.notes}
                      onChange={(e) => setHistoryForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="SOAP-style detail: subjective, objective, assessment, plan…"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button variant="outline" size="sm" onClick={closeHistoryModal}>
                  Cancel
                </Button>
                {hasPermission("patient_history.create") && (
                  <Button size="sm" disabled={historySubmitting || historyLoading} onClick={handleRecordHistory}>
                    {historySubmitting ? "Saving…" : "Save to chart"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
