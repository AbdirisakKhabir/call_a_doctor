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

type Service = { id: number; name: string; description: string | null; price: number; durationMinutes: number | null; branch: { id: number; name: string } | null };
type Branch = { id: number; name: string };

export default function ServicesPage() {
  const { hasPermission } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceTotal, setServiceTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", durationMinutes: "", branchId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");
  const canDelete = hasPermission("appointments.delete");

  async function loadServices() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await authFetch(`/api/services?${params}`);
    if (res.ok) {
      const body = await res.json();
      setServices(body.data ?? []);
      setServiceTotal(typeof body.total === "number" ? body.total : 0);
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
    loadServices().finally(() => setLoading(false));
  }, [page]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", description: "", price: "", durationMinutes: "", branchId: branches[0] ? String(branches[0].id) : "" });
    setError("");
  }

  function openEdit(s: Service) {
    setModal("edit");
    setEditingId(s.id);
    setForm({ name: s.name, description: s.description ?? "", price: String(s.price), durationMinutes: s.durationMinutes ? String(s.durationMinutes) : "", branchId: s.branch ? String(s.branch.id) : "" });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadServices();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/services/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadServices();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this service?")) return;
    const res = await authFetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) await loadServices();
    else alert((await res.json()).error || "Failed");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Services" />
        {canCreate && <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Service</Button>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" /></div>
        ) : serviceTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16"><p className="text-sm text-gray-500">No services yet.</p>{canCreate && <Button className="mt-2" onClick={openAdd} size="sm">Add Service</Button>}</div>
        ) : (
          <Table>
            <TableHeader><TableRow className="bg-transparent! hover:bg-transparent!"><TableCell isHeader>Name</TableCell><TableCell isHeader>Price</TableCell><TableCell isHeader>Duration</TableCell><TableCell isHeader>Branch</TableCell><TableCell isHeader className="text-right">Actions</TableCell></TableRow></TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>${s.price.toFixed(2)}</TableCell>
                  <TableCell>{s.durationMinutes ? `${s.durationMinutes} min` : "—"}</TableCell>
                  <TableCell>{s.branch?.name || "All"}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && <button type="button" onClick={() => openEdit(s)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"><PencilIcon className="h-4 w-4" /></button>}
                      {canDelete && <button type="button" onClick={() => handleDelete(s.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"><TrashBinIcon className="h-4 w-4" /></button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={serviceTotal}
          page={page}
          pageSize={pageSize}
          noun="services"
          onPageChange={setPage}
        />
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700"><h2 className="text-lg font-semibold">{modal === "add" ? "Add Service" : "Edit Service"}</h2><button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">×</button></div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
              <div><Label>Name *</Label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Consultation" className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Price ($) *</Label><input type="number" step="0.01" min="0" required value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Duration (minutes)</Label><input type="number" min="0" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} placeholder="e.g. 30" className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div><Label>Branch</Label><select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}</select></div>
              <div><Label>Description</Label><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" /></div>
              <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button><Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : modal === "add" ? "Create" : "Update"}</Button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
