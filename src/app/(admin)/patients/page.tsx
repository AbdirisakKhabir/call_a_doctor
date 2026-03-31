"use client";

import React, { useEffect, useState } from "react";
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

export default function PatientsPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const historyParams = searchParams.get("history") === "1" ? { patientId: searchParams.get("patientId"), appointmentId: searchParams.get("appointmentId") } : null;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [historyModal, setHistoryModal] = useState(!!historyParams);
  const [historyForm, setHistoryForm] = useState({ type: "notes", notes: "" });
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
    if (historyParams) authFetch("/api/doctors").then((r) => r.ok && r.json()).then((d) => setDoctors(d || []));
  }, [historyParams]);

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

  async function handleRecordHistory() {
    if (!historyParams?.patientId || !historyForm.notes.trim()) return;
    const doctorId = (document.getElementById("history-doctor") as HTMLSelectElement)?.value;
    if (!doctorId) { alert("Select a doctor"); return; }
    setHistorySubmitting(true);
    try {
      const res = await authFetch("/api/patient-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: Number(historyParams.patientId),
          appointmentId: historyParams.appointmentId ? Number(historyParams.appointmentId) : null,
          doctorId: Number(doctorId),
          type: historyForm.type,
          notes: historyForm.notes.trim(),
        }),
      });
      if (res.ok) {
        setHistoryModal(false);
        setHistoryForm({ type: "notes", notes: "" });
        if (typeof window !== "undefined") window.history.replaceState({}, "", "/patients");
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
                <Label>Notes</Label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Medical notes, etc." />
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

      {historyModal && historyParams && (hasPermission("patient_history.create") || hasPermission("patient_history.view")) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Record Patient History</h2>
              <button type="button" onClick={() => { setHistoryModal(false); window.history.replaceState({}, "", "/patients"); }} className="text-gray-400 hover:bg-gray-100 rounded-lg p-1">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <Label>Type</Label>
                <select id="history-type" value={historyForm.type} onChange={(e) => setHistoryForm((f) => ({ ...f, type: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  <option value="chief_complaint">Chief Complaint</option>
                  <option value="history">History</option>
                  <option value="examination">Examination</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="notes">Notes</option>
                </select>
              </div>
              <div>
                <Label>Doctor *</Label>
                <select id="history-doctor" required className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  <option value="">Select doctor</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Notes *</Label>
                <textarea required value={historyForm.notes} onChange={(e) => setHistoryForm((f) => ({ ...f, notes: e.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" placeholder="Enter clinical notes..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setHistoryModal(false); window.history.replaceState({}, "", "/patients"); }}>Cancel</Button>
                <Button size="sm" disabled={historySubmitting} onClick={handleRecordHistory}>{historySubmitting ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
