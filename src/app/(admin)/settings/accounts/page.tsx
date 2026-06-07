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
import { PencilIcon, PlusIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Account = {
  id: number;
  name: string;
  code: string | null;
  type: string;
  openingBalance: number;
  isActive: boolean;
  balance: number;
};

export default function SettingsAccountsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("accounts.view");
  const canManage = hasPermission("accounts.manage");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountTotal, setAccountTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    type: "cash",
    openingBalance: "0",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await authFetch(`/api/finance/accounts?${params}`);
    if (res.ok) {
      const body = await res.json();
      setAccounts(body.data ?? []);
      setAccountTotal(typeof body.total === "number" ? body.total : 0);
    }
  }, [page, pageSize]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [canView, load]);

  function openAdd() {
    setModal("add");
    setEditingId(null);
    setForm({ name: "", code: "", type: "cash", openingBalance: "0" });
    setError("");
  }

  function openEdit(a: Account) {
    setModal("edit");
    setEditingId(a.id);
    setForm({
      name: a.name,
      code: a.code ?? "",
      type: a.type,
      openingBalance: String(a.openingBalance),
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        type: form.type,
        openingBalance: Number(form.openingBalance) || 0,
      };
      if (modal === "add") {
        const res = await authFetch("/api/finance/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          return;
        }
        await load();
        setModal(null);
      } else if (modal === "edit" && editingId) {
        const res = await authFetch(`/api/finance/accounts/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Accounts" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Accounts" />
        {canManage && (
          <Button startIcon={<PlusIcon />} onClick={openAdd} size="sm">
            New account
          </Button>
        )}
      </div>

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
                <TableCell isHeader>Type</TableCell>
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader className="text-right">Opening</TableCell>
                <TableCell isHeader className="text-right">Balance</TableCell>
                <TableCell isHeader>Status</TableCell>
                {canManage && <TableCell isHeader className="text-right">Actions</TableCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="capitalize">{a.type}</TableCell>
                  <TableCell>{a.code || "—"}</TableCell>
                  <TableCell className="text-right">${a.openingBalance.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        a.balance > 0
                          ? "inline-flex rounded-full bg-success-50 px-2.5 py-0.5 font-medium text-success-600 dark:bg-success-500/15 dark:text-success-500"
                          : "font-medium"
                      }
                    >
                      ${a.balance.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>{a.isActive ? "Active" : "Inactive"}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                        aria-label="Edit"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={accountTotal}
          page={page}
          pageSize={pageSize}
          noun="accounts"
          onPageChange={setPage}
        />
      </div>

      {modal && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">{modal === "add" ? "New account" : "Edit account"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">
                  {error}
                </div>
              )}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <Label>Code</Label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="mobile">Mobile</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label>Opening balance</Label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.openingBalance}
                  onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
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
      )}
    </>
  );
}
