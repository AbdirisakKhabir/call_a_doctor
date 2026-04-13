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

type LabTest = {
  id: number;
  name: string;
  code: string | null;
  unit: string | null;
  normalRange: string | null;
  price: number;
  isActive: boolean;
  category: { id: number; name: string };
};
type LabCategory = { id: number; name: string };

export default function LabTestsPage() {
  const { hasPermission } = useAuth();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [testTotal, setTestTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [categories, setCategories] = useState<LabCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ categoryId: "", name: "", code: "", unit: "", normalRange: "", price: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("lab.create");
  const canEdit = hasPermission("lab.edit");
  const canDelete = hasPermission("lab.delete");

  async function loadCategories() {
    const cRes = await authFetch("/api/lab/categories");
    if (cRes.ok) {
      const list = (await cRes.json()) as { id: number; name: string }[];
      setCategories(list.map((x) => ({ id: x.id, name: x.name })));
    }
  }

  async function loadTests() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const tRes = await authFetch(`/api/lab/tests?${params}`);
    if (tRes.ok) {
      const body = await tRes.json();
      setTests(body.data ?? []);
      setTestTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTests().finally(() => setLoading(false));
  }, [page]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ categoryId: categories[0] ? String(categories[0].id) : "", name: "", code: "", unit: "", normalRange: "", price: "" });
    setError("");
  }

  function openEdit(t: LabTest) {
    setModal("edit");
    setEditingId(t.id);
    setForm({
      categoryId: String(t.category.id),
      name: t.name,
      code: t.code ?? "",
      unit: t.unit ?? "",
      normalRange: t.normalRange ?? "",
      price: String(t.price ?? 0),
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/lab/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            categoryId: Number(form.categoryId),
            price: form.price === "" ? 0 : Number(form.price),
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadTests();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/lab/tests/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            categoryId: Number(form.categoryId),
            price: form.price === "" ? 0 : Number(form.price),
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        await loadTests();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this test?")) return;
    const res = await authFetch(`/api/lab/tests/${id}`, { method: "DELETE" });
    if (res.ok) await loadTests();
    else alert((await res.json()).error || "Failed");
  }

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab Tests" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Lab Tests" />
        {canCreate && categories.length > 0 && <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Test</Button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : testTotal === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No lab tests yet. Add a category first if needed, then create tests.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Test</TableCell>
                <TableCell isHeader>Category</TableCell>
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Unit</TableCell>
                <TableCell isHeader>Normal Range</TableCell>
                <TableCell isHeader className="text-right">Test price</TableCell>
                {(canEdit || canDelete) && <TableCell isHeader>Actions</TableCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.category.name}</TableCell>
                  <TableCell>{t.code || "—"}</TableCell>
                  <TableCell>{t.unit || "—"}</TableCell>
                  <TableCell>{t.normalRange || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">${(t.price ?? 0).toFixed(2)}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell>
                      <div className="flex gap-2">
                        {canEdit && <button onClick={() => openEdit(t)} className="text-brand-500 hover:underline"><PencilIcon className="size-4" /></button>}
                        {canDelete && <button onClick={() => handleDelete(t.id)} className="text-error-500 hover:underline"><TrashBinIcon className="size-4" /></button>}
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
          total={testTotal}
          page={page}
          pageSize={pageSize}
          noun="tests"
          onPageChange={setPage}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">{modal === "add" ? "Add Test" : "Edit Test"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
              <div>
                <Label htmlFor="cat">Category *</Label>
                <select id="cat" required value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  <option value="">Select</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="name">Name *</Label>
                <input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>
              <div>
                <Label htmlFor="code">Code</Label>
                <input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <input id="unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" placeholder="e.g. mg/dL" />
              </div>
              <div>
                <Label htmlFor="range">Normal Range</Label>
                <input id="range" value={form.normalRange} onChange={(e) => setForm((f) => ({ ...f, normalRange: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" placeholder="e.g. 70-100" />
              </div>
              <div>
                <Label htmlFor="price">Test price ($)</Label>
                <input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-500">Charged to the patient when this test is ordered.</p>
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
