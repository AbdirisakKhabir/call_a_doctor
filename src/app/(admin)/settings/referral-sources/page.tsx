"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";

type ReferralSource = {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export default function ReferralSourcesSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");

  const [rows, setRows] = useState<ReferralSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", sortOrder: "0" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await authFetch("/api/referral-sources?all=true");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [canManage]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", sortOrder: "0" });
    setError("");
  }

  function openEdit(r: ReferralSource) {
    setModal("edit");
    setEditingId(r.id);
    setForm({ name: r.name, sortOrder: String(r.sortOrder) });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/referral-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, sortOrder: form.sortOrder }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await load();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/referral-sources/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, sortOrder: form.sortOrder }),
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

  async function toggleActive(r: ReferralSource) {
    const res = await authFetch(`/api/referral-sources/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    if (res.ok) await load();
    else alert((await res.json()).error || "Failed");
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this referral source? Clients using it will have the field cleared.")) return;
    const res = await authFetch(`/api/referral-sources/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert((await res.json()).error || "Failed");
  }

  if (!canManage) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Referred from" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have access to manage referral sources.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Referred from" />
      <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Define options for <strong className="font-medium text-gray-700 dark:text-gray-300">Referred from</strong> when registering clients. Inactive options stay on existing records but are hidden from new registrations.
      </p>

      <div className="mt-6 flex justify-end">
        <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">
          Add source
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">No referral sources yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Order</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Status</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.sortOrder}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleActive(r)}
                      className={
                        r.isActive
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }
                    >
                      {r.isActive ? "Active" : "Inactive"}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                        aria-label="Edit"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10"
                        aria-label="Delete"
                      >
                        <TrashBinIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "Add referral source" : "Edit referral source"}</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  placeholder="e.g. Walk-in, Facebook, Dr. Smith"
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lower numbers appear first in dropdowns.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? "Saving..." : modal === "add" ? "Create" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
