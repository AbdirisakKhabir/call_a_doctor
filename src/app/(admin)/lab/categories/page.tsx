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

type Category = { id: number; name: string; description: string | null; isActive: boolean; _count?: { tests: number } };

export default function LabCategoriesPage() {
  const { hasPermission } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTotal, setCategoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("lab.create");
  const canEdit = hasPermission("lab.edit");
  const canDelete = hasPermission("lab.delete");

  async function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await authFetch(`/api/lab/categories?${params}`);
    if (res.ok) {
      const body = await res.json();
      setCategories(body.data ?? []);
      setCategoryTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [page]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", description: "" });
    setError("");
  }

  function openEdit(c: Category) {
    setModal("edit");
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description ?? "" });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/lab/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await load();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/lab/categories/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await load();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this category?")) return;
    const res = await authFetch(`/api/lab/categories/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert((await res.json()).error || "Failed");
  }

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab Categories" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Lab Categories" />
        {canCreate && <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Category</Button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : categoryTotal === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No categories yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Description</TableCell>
                <TableCell isHeader>Tests</TableCell>
                {(canEdit || canDelete) && <TableCell isHeader>Actions</TableCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.description || "—"}</TableCell>
                  <TableCell>{c._count?.tests ?? 0}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell>
                      <div className="flex gap-2">
                        {canEdit && <button onClick={() => openEdit(c)} className="text-brand-500 hover:underline"><PencilIcon className="size-4" /></button>}
                        {canDelete && <button onClick={() => handleDelete(c.id)} className="text-error-500 hover:underline"><TrashBinIcon className="size-4" /></button>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={categoryTotal}
          page={page}
          pageSize={pageSize}
          noun="categories"
          onPageChange={setPage}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">{modal === "add" ? "Add Category" : "Edit Category"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
              <div>
                <Label htmlFor="name">Name *</Label>
                <input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <textarea id="desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : "Save"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
