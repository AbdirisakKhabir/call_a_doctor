"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Doctor = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  userId: number | null;
  branch: { id: number; name: string } | null;
};
type Branch = { id: number; name: string };

export default function DoctorsPage() {
  const { hasPermission } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorTotal, setDoctorTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialty: "", branchId: "", userId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");
  const canDelete = hasPermission("appointments.delete");

  async function loadDoctors() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await authFetch(`/api/doctors?${params}`);
    if (res.ok) {
      const body = await res.json();
      setDoctors(body.data ?? []);
      setDoctorTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadBranchesList() {
    const brRes = await authFetch("/api/branches");
    if (brRes.ok) setBranches(await brRes.json());
  }

  useEffect(() => {
    loadBranchesList();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadDoctors().finally(() => setLoading(false));
  }, [page]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", email: "", phone: "", specialty: "", branchId: branches[0] ? String(branches[0].id) : "", userId: "" });
    setError("");
  }

  function openEdit(d: Doctor) {
    setModal("edit");
    setEditingId(d.id);
    setForm({
      name: d.name,
      email: d.email ?? "",
      phone: d.phone ?? "",
      specialty: d.specialty ?? "",
      branchId: d.branch ? String(d.branch.id) : "",
      userId: d.userId != null ? String(d.userId) : "",
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const { userId: _u, ...createBody } = form;
        const res = await authFetch("/api/doctors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadDoctors();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const patchBody: Record<string, unknown> = {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          specialty: form.specialty || null,
          branchId: form.branchId ? Number(form.branchId) : null,
        };
        if (form.userId.trim()) patchBody.userId = Number(form.userId);
        else patchBody.userId = null;
        const res = await authFetch(`/api/doctors/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadDoctors();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this doctor?")) return;
    const res = await authFetch(`/api/doctors/${id}`, { method: "DELETE" });
    if (res.ok) await loadDoctors();
    else alert((await res.json()).error || "Failed");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Doctors" />
        {canCreate && <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Doctor</Button>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" /></div>
        ) : doctorTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16"><p className="text-sm text-gray-500">No doctors yet.</p>{canCreate && <Button className="mt-2" onClick={openAdd} size="sm">Add Doctor</Button>}</div>
        ) : (
          <Table>
            <TableHeader><TableRow className="bg-transparent! hover:bg-transparent!"><TableCell isHeader>Name</TableCell><TableCell isHeader>Specialty</TableCell><TableCell isHeader>Branch</TableCell><TableCell isHeader>Phone</TableCell><TableCell isHeader className="text-right">Actions</TableCell></TableRow></TableHeader>
            <TableBody>
              {doctors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.specialty || "—"}</TableCell>
                  <TableCell>{d.branch?.name || "—"}</TableCell>
                  <TableCell>
                    <div>{d.phone || "—"}</div>
                    {d.userId != null && (
                      <div className="text-xs text-gray-500">User #{d.userId}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && <button type="button" onClick={() => openEdit(d)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"><PencilIcon className="h-4 w-4" /></button>}
                      {canDelete && <button type="button" onClick={() => handleDelete(d.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"><TrashBinIcon className="h-4 w-4" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={doctorTotal}
          page={page}
          pageSize={pageSize}
          noun="doctors"
          onPageChange={setPage}
        />
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700"><h2 className="text-lg font-semibold">{modal === "add" ? "Add Doctor" : "Edit Doctor"}</h2><button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">×</button></div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
              <div><Label>Name *</Label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Specialty</Label><input value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="e.g. General Practice" className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Branch</Label><select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"><option value="">Select branch</option>{branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}</select></div>
              <div><Label>Phone</Label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Email</Label><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              {modal === "edit" && (
                <div>
                  <Label>Linked user account ID</Label>
                  <input
                    type="number"
                    min={1}
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    placeholder="Staff user id (Doctor role)"
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Link a login user with the Doctor role so they only see their visit cards. Clear to unlink.
                  </p>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button><Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : modal === "add" ? "Create" : "Update"}</Button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
