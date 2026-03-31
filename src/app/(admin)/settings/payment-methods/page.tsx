"use client";

import React, { useEffect, useState, useCallback } from "react";
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
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type PM = {
  id: number;
  name: string;
  isActive: boolean;
  account: { id: number; name: string; type: string; isActive: boolean };
};

type AccountOpt = { id: number; name: string };

export default function PaymentMethodsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("accounts.view");
  const canManage = hasPermission("accounts.manage");

  const [methods, setMethods] = useState<PM[]>([]);
  const [methodTotal, setMethodTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", accountId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadAccountOptions = useCallback(async () => {
    const r2 = await authFetch("/api/finance/accounts");
    if (r2.ok) {
      const accs = (await r2.json()) as { isActive: boolean; id: number; name: string }[];
      setAccounts(
        accs
          .filter((a) => a.isActive)
          .map((a) => ({ id: a.id, name: a.name }))
      );
    }
  }, []);

  const loadMethods = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const r1 = await authFetch(`/api/finance/payment-methods?${params}`);
    if (r1.ok) {
      const body = await r1.json();
      setMethods(body.data ?? []);
      setMethodTotal(typeof body.total === "number" ? body.total : 0);
    }
  }, [page, pageSize]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadAccountOptions();
  }, [canView, loadAccountOptions]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadMethods().finally(() => setLoading(false));
  }, [canView, loadMethods]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", accountId: accounts[0] ? String(accounts[0].id) : "" });
    setError("");
  }

  function openEdit(m: PM) {
    setModal("edit");
    setEditingId(m.id);
    setForm({ name: m.name, accountId: String(m.account.id) });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (modal === "add") {
        const res = await authFetch("/api/finance/payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.trim(), accountId: Number(form.accountId) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await loadMethods();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/finance/payment-methods/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name.trim(), accountId: Number(form.accountId) }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await loadMethods();
        setModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this payment method?")) return;
    const res = await authFetch(`/api/finance/payment-methods/${id}`, { method: "DELETE" });
    if (res.ok) await loadMethods();
    else alert((await res.json()).error || "Failed");
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Payment methods" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Payment methods" />
        {canManage && (
          <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm" disabled={accounts.length === 0}>
            New payment method
          </Button>
        )}
      </div>
      {accounts.length === 0 && !loading && (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">Create at least one active account first.</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Account</TableCell>
                <TableCell isHeader>Status</TableCell>
                {canManage && <TableCell isHeader className="text-right">Actions</TableCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.account.name}</TableCell>
                  <TableCell>{m.isActive ? "Active" : "Inactive"}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
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
          total={methodTotal}
          page={page}
          pageSize={pageSize}
          noun="payment methods"
          onPageChange={setPage}
        />
      </div>

      {modal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "New payment method" : "Edit payment method"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                  placeholder="e.g. Main cash, Visa terminal"
                />
              </div>
              <div>
                <Label>Deposit to account *</Label>
                <select
                  required
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="">Select account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setModal(null)} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
