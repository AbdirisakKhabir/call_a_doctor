"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Supplier = {
  id: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};
type Branch = { id: number; name: string };

export default function SuppliersPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("pharmacy.create");
  const canEdit = hasPermission("pharmacy.edit");
  const canDelete = hasPermission("pharmacy.delete");

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
  }

  async function loadSuppliers() {
    if (!branchId) return;
    const params = new URLSearchParams({
      branchId,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await authFetch(`/api/pharmacy/suppliers?${params}`);
    if (res.ok) {
      const body = await res.json();
      setSuppliers(body.data ?? []);
      setSupplierTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    loadSuppliers().finally(() => setLoading(false));
  }, [branchId, page]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", contactPerson: "", email: "", phone: "", address: "" });
    setError("");
  }

  function openEdit(s: Supplier) {
    setModal("edit");
    setEditingId(s.id);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        if (!branchId) {
          setError("Select a branch.");
          return;
        }
        const res = await authFetch("/api/pharmacy/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, branchId: Number(branchId) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          return;
        }
        await loadSuppliers();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/pharmacy/suppliers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update");
          return;
        }
        await loadSuppliers();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this supplier?")) return;
    const res = await authFetch(`/api/pharmacy/suppliers/${id}`, { method: "DELETE" });
    if (res.ok) await loadSuppliers();
    else alert((await res.json()).error || "Failed to delete");
  }

  if (!hasPermission("pharmacy.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Suppliers" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PageBreadCrumb pageTitle="Suppliers" />
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              disabled={branches.length <= 1}
              className="h-10 min-w-[10rem] rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {canCreate && (
          <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Supplier</Button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : supplierTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No suppliers yet.</p>
            {canCreate && <Button className="mt-2" onClick={openAdd} size="sm">Add Supplier</Button>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>#</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Contact</TableCell>
                <TableCell isHeader>Email</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader>Address</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s, idx) => (
                <TableRow key={s.id}>
                  <TableCell className="text-gray-400">{(page - 1) * pageSize + idx + 1}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contactPerson || "—"}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{s.address || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      {canEdit && (
                        <button type="button" onClick={() => openEdit(s)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10" aria-label="Edit">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleDelete(s.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10" aria-label="Delete">
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
          total={supplierTotal}
          page={page}
          pageSize={pageSize}
          noun="suppliers"
          onPageChange={setPage}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "Add Supplier" : "Edit Supplier"}</h2>
              <button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div>
                <Label>Name *</Label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Supplier name" />
              </div>
              <div>
                <Label>Contact Person</Label>
                <input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="John Doe" />
              </div>
              <div>
                <Label>Email</Label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="supplier@example.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="+1234567890" />
              </div>
              <div>
                <Label>Address</Label>
                <textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Full address" />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : modal === "add" ? "Create" : "Update"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
