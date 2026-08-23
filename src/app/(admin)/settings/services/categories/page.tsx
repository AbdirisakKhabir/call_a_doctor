"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { capitalizeNamePart } from "@/lib/capitalize-name";
import { confirmDelete, showErrorAlert } from "@/lib/swal-dialogs";

type Category = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  _count?: { services: number };
};

export default function ServiceCategoryListPage() {
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

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canEdit = hasPermission("appointments.edit") || hasPermission("appointments.view");
  const canDelete = hasPermission("appointments.delete");

  async function load() {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      all: "true",
    });
    const res = await authFetch(`/api/service-categories?${params}`);
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
        const res = await authFetch("/api/service-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await load();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/service-categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await load();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirmDelete({ text: "Delete this category?" }))) return;
    const res = await authFetch(`/api/service-categories/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else await showErrorAlert((await res.json()).error || "Failed");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Category list" />
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/settings/services"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            All services
          </Link>
          {canCreate ? (
            <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">
              Add category
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : categoryTotal === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500">No categories yet.</p>
            {canCreate ? (
              <button
                type="button"
                onClick={openAdd}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                Add category
              </button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Description</TableCell>
                <TableCell isHeader>Services</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/settings/services/categories/${c.id}`}
                      className="text-gray-900 hover:text-brand-600 hover:underline dark:text-white dark:hover:text-brand-400"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-gray-600 dark:text-gray-400">
                    {c.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/settings/services/categories/${c.id}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {c._count?.services ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Link
                        href={`/settings/services/categories/${c.id}`}
                        className="inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-white/5"
                      >
                        Services
                      </Link>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                          aria-label="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                          aria-label="Delete"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                      {!canEdit && !canDelete ? <span className="text-gray-400">—</span> : null}
                    </div>
                  </TableCell>
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

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold">{modal === "add" ? "Add category" : "Edit category"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}
              <div>
                <Label htmlFor="name">Name *</Label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={(e) => setForm((f) => ({ ...f, name: capitalizeNamePart(e.target.value) }))}
                  placeholder="e.g. Consultation"
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <Label htmlFor="desc">Description</Label>
                <textarea
                  id="desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
