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
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type ExpenseCategory = { id: number; name: string; isActive?: boolean };
type Expense = {
  id: number;
  categoryId: number;
  amount: number;
  expenseDate: string;
  description: string | null;
  category: { id: number; name: string };
  createdBy: { id: number; name: string | null } | null;
};

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "categories" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [filters, setFilters] = useState({ categoryId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canView = hasPermission("expenses.view");
  const canCreate = hasPermission("expenses.create");
  const canEdit = hasPermission("expenses.edit");
  const canDelete = hasPermission("expenses.delete");

  async function loadExpenses() {
    const params = new URLSearchParams();
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/expenses?${params}`);
    if (res.ok) {
      const body = await res.json();
      setExpenses(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  async function loadCategories(all = false) {
    const res = await authFetch(`/api/expense-categories${all ? "?all=true" : ""}`);
    if (res.ok) setCategories(await res.json());
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filters.categoryId, filters.from, filters.to]);

  useEffect(() => {
    setLoading(true);
    loadExpenses().finally(() => setLoading(false));
  }, [page, filters.categoryId, filters.from, filters.to]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({
      categoryId: categories[0] ? String(categories[0].id) : "",
      amount: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
    setError("");
  }

  function openEdit(e: Expense) {
    setModal("edit");
    setEditingId(e.id);
    setForm({
      categoryId: String(e.categoryId),
      amount: String(e.amount),
      expenseDate: new Date(e.expenseDate).toISOString().slice(0, 10),
      description: e.description ?? "",
    });
    setError("");
  }

  function openCategories() {
    setModal("categories");
    loadCategories(true);
    setCategoryForm({ name: "" });
    setEditingCategoryId(null);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: Number(form.categoryId),
            amount: Number(form.amount),
            expenseDate: form.expenseDate,
            description: form.description || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          return;
        }
        await loadExpenses();
        await loadCategories();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/expenses/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: Number(form.categoryId),
            amount: Number(form.amount),
            expenseDate: form.expenseDate,
            description: form.description || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update");
          return;
        }
        await loadExpenses();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this expense?")) return;
    const res = await authFetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) await loadExpenses();
    else alert((await res.json()).error || "Failed to delete");
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (editingCategoryId) {
        const res = await authFetch(`/api/expense-categories/${editingCategoryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: categoryForm.name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update");
          return;
        }
        await loadCategories(true);
        await loadCategories(false);
        setEditingCategoryId(null);
        setCategoryForm({ name: "" });
      } else {
        const res = await authFetch("/api/expense-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: categoryForm.name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          return;
        }
        await loadCategories(true);
        await loadCategories(false);
        setCategoryForm({ name: "" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCategoryDelete(id: number) {
    if (!confirm("Delete this category? Expenses in it will need to be reassigned.")) return;
    const res = await authFetch(`/api/expense-categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadCategories(true);
      await loadCategories(false);
      await loadExpenses();
    } else alert((await res.json()).error || "Failed to delete");
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Expenses" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Expenses" />
        <div className="flex gap-2">
          {canCreate && <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">Add Expense</Button>}
          <Button variant="outline" onClick={openCategories} size="sm">Manage Categories</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <select
          value={filters.categoryId}
          onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
          className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        <DateRangeFilter
          from={filters.from}
          to={filters.to}
          onFromChange={(v) => setFilters((f) => ({ ...f, from: v }))}
          onToChange={(v) => setFilters((f) => ({ ...f, to: v }))}
          onClear={() => setFilters((f) => ({ ...f, from: "", to: "" }))}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No expenses yet.</p>
            {canCreate && <Button className="mt-2" onClick={openAdd} size="sm">Add Expense</Button>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Date</TableCell>
                <TableCell isHeader>Category</TableCell>
                <TableCell isHeader>Amount</TableCell>
                <TableCell isHeader>Description</TableCell>
                <TableCell isHeader>Recorded By</TableCell>
                {(canEdit || canDelete) && <TableCell isHeader className="text-right">Actions</TableCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{e.category.name}</TableCell>
                  <TableCell>${e.amount.toFixed(2)}</TableCell>
                  <TableCell>{e.description || "—"}</TableCell>
                  <TableCell>{e.createdBy?.name || "—"}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <button type="button" onClick={() => openEdit(e)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10" aria-label="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" onClick={() => handleDelete(e.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10" aria-label="Delete">
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        )}
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
          total={total}
          page={page}
          pageSize={pageSize}
          noun="expenses"
          onPageChange={setPage}
        />
      </div>

      {(modal === "add" || modal === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md my-8 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "Add Expense" : "Edit Expense"}</h2>
              <button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div>
                <Label>Category *</Label>
                <select required value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white">
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount *</Label>
                  <input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" />
                </div>
                <DateField
                  id="expense-date"
                  label="Date *"
                  required
                  value={form.expenseDate}
                  onChange={(v) => setForm((f) => ({ ...f, expenseDate: v }))}
                  appendToBody
                />
              </div>
              <div>
                <Label>Description</Label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : modal === "add" ? "Add Expense" : "Update"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "categories" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md my-8 rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Expense Categories</h2>
              <button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <form onSubmit={handleCategorySubmit} className="flex gap-2">
                <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} placeholder="Category name" className="flex-1 h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white" />
                <Button type="submit" disabled={submitting || !categoryForm.name.trim()} size="sm">{editingCategoryId ? "Update" : "Add"}</Button>
              </form>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                    <span className="font-medium">{c.name}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { setEditingCategoryId(c.id); setCategoryForm({ name: c.name }); setError(""); }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10" aria-label="Edit">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleCategoryDelete(c.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10" aria-label="Delete">
                        <TrashBinIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {categories.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No categories yet. Add one above.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
