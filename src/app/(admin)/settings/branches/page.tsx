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

type Branch = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

type UserRow = {
  id: number;
  email: string;
  name: string | null;
  role: { name: string };
  branchIds: number[] | null;
};

export default function SettingsBranchesPage() {
  const { hasPermission, refreshUser } = useAuth();
  const canManage = hasPermission("settings.manage");

  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [branchRows, setBranchRows] = useState<Branch[]>([]);
  const [branchPage, setBranchPage] = useState(1);
  const [branchTotal, setBranchTotal] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const listPageSize = 20;
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [branchModal, setBranchModal] = useState<"add" | "edit" | null>(null);
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [userBranchEdit, setUserBranchEdit] = useState<{
    userId: number;
    email: string;
    selected: Set<number>;
  } | null>(null);

  const loadAllBranchesList = useCallback(async () => {
    const res = await authFetch("/api/branches?all=true");
    if (res.ok) setAllBranches(await res.json());
  }, []);

  const loadBranchTable = useCallback(async () => {
    const params = new URLSearchParams({ all: "true", page: String(branchPage), pageSize: String(listPageSize) });
    const res = await authFetch(`/api/branches?${params}`);
    if (res.ok) {
      const body = await res.json();
      setBranchRows(body.data ?? []);
      setBranchTotal(typeof body.total === "number" ? body.total : 0);
    }
  }, [branchPage, listPageSize]);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({
      includeBranches: "true",
      page: String(userPage),
      pageSize: String(listPageSize),
    });
    const res = await authFetch(`/api/users?${params}`);
    if (res.ok) {
      const body = await res.json();
      setUsers(body.data ?? []);
      setUserTotal(typeof body.total === "number" ? body.total : 0);
    }
  }, [userPage, listPageSize]);

  useEffect(() => {
    if (!canManage) {
      setBranchesLoading(false);
      setUsersLoading(false);
      return;
    }
    loadAllBranchesList();
  }, [canManage, loadAllBranchesList]);

  useEffect(() => {
    if (!canManage) return;
    setBranchesLoading(true);
    loadBranchTable().finally(() => setBranchesLoading(false));
  }, [canManage, loadBranchTable]);

  useEffect(() => {
    if (!canManage) return;
    setUsersLoading(true);
    loadUsers().finally(() => setUsersLoading(false));
  }, [canManage, loadUsers]);

  function openAddBranch() {
    setBranchModal("add");
    setEditingBranchId(null);
    setBranchForm({ name: "", address: "", phone: "", email: "" });
    setError("");
  }

  function openEditBranch(b: Branch) {
    setBranchModal("edit");
    setEditingBranchId(b.id);
    setBranchForm({
      name: b.name,
      address: b.address ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
    });
    setError("");
  }

  async function handleBranchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (branchModal === "add") {
        const res = await authFetch("/api/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(branchForm),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create");
          return;
        }
        await loadAllBranchesList();
        await loadBranchTable();
        setBranchModal(null);
      } else if (branchModal === "edit" && editingBranchId) {
        const res = await authFetch(`/api/branches/${editingBranchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(branchForm),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to update");
          return;
        }
        await loadAllBranchesList();
        await loadBranchTable();
        setBranchModal(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivateBranch(id: number) {
    if (!confirm("Deactivate this branch? It will be hidden from new transactions.")) return;
    const res = await authFetch(`/api/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) {
      await loadAllBranchesList();
      await loadBranchTable();
    } else alert((await res.json()).error || "Failed");
  }

  async function handleDeleteBranch(id: number) {
    if (!confirm("Permanently delete this branch? This only works if nothing references it.")) return;
    const res = await authFetch(`/api/branches/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadAllBranchesList();
      await loadBranchTable();
    }
    else alert((await res.json()).error || "Failed to delete");
  }

  function openUserBranches(u: UserRow) {
    const selected = new Set<number>();
    if (u.branchIds && u.branchIds.length > 0) {
      u.branchIds.forEach((id) => selected.add(id));
    }
    setUserBranchEdit({ userId: u.id, email: u.email, selected });
  }

  function toggleUserBranch(branchId: number) {
    setUserBranchEdit((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return { ...prev, selected: next };
    });
  }

  async function saveUserBranches() {
    if (!userBranchEdit) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/users/${userBranchEdit.userId}/branches`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchIds: [...userBranchEdit.selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update");
        return;
      }
      await loadUsers();
      await refreshUser();
      setUserBranchEdit(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Branches & access" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to manage branches.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Branches & access" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Manage branches and which users may record pharmacy and other transactions per branch. Leave all branches unchecked for a user to allow access to every branch.
        </p>
      </div>

      <div className="space-y-10">
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Branches</h2>
            <Button startIcon={<PlusIcon />} onClick={openAddBranch} size="sm">
              New Branch
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {branchesLoading ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
              </div>
            ) : branchTotal === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-sm text-gray-500 dark:text-gray-400">No branches yet.</p>
                <Button className="mt-2" onClick={openAddBranch} size="sm">
                  Create Branch
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Phone</TableCell>
                    <TableCell isHeader>Status</TableCell>
                    <TableCell isHeader className="text-right">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchRows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>{b.phone || "—"}</TableCell>
                      <TableCell>
                        <span
                          className={
                            b.isActive
                              ? "text-success-600 dark:text-success-400"
                              : "text-gray-400"
                          }
                        >
                          {b.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEditBranch(b)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                            aria-label="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {b.isActive && (
                            <button
                              type="button"
                              onClick={() => handleDeactivateBranch(b.id)}
                              className="rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              Deactivate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteBranch(b.id)}
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

            <ListPaginationFooter
              loading={branchesLoading}
              total={branchTotal}
              page={branchPage}
              pageSize={listPageSize}
              noun="branches"
              onPageChange={setBranchPage}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">User branch access</h2>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            {usersLoading ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>User</TableCell>
                    <TableCell isHeader>Role</TableCell>
                    <TableCell isHeader>Branches</TableCell>
                    <TableCell isHeader className="text-right">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.name || u.email}</div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </TableCell>
                      <TableCell>{u.role.name}</TableCell>
                      <TableCell className="max-w-xs text-sm text-gray-600 dark:text-gray-400">
                        {!u.branchIds || u.branchIds.length === 0
                          ? "All branches"
                          : allBranches
                              .filter((b) => u.branchIds!.includes(b.id))
                              .map((b) => b.name)
                              .join(", ") || `${u.branchIds.length} selected`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openUserBranches(u)}>
                          Assign branches
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <ListPaginationFooter
              loading={usersLoading}
              total={userTotal}
              page={userPage}
              pageSize={listPageSize}
              noun="users"
              onPageChange={setUserPage}
            />
          </div>
        </section>
      </div>

      {(branchModal === "add" || branchModal === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {branchModal === "add" ? "New Branch" : "Edit Branch"}
              </h2>
              <button
                type="button"
                onClick={() => setBranchModal(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleBranchSubmit} className="space-y-4 px-6 py-5">
              {error && (
                <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Label>Name *</Label>
                <input
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div>
                <Label>Address</Label>
                <input
                  value={branchForm.address}
                  onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <input
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <input
                    type="email"
                    value={branchForm.email}
                    onChange={(e) => setBranchForm((f) => ({ ...f, email: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setBranchModal(null)} size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm">
                  {submitting ? "Saving..." : branchModal === "add" ? "Create" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userBranchEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold">Branch access</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{userBranchEdit.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setUserBranchEdit(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Check branches this user may use for pharmacy sales and purchases. Leave all unchecked to allow every branch.
              </p>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {allBranches.filter((b) => b.isActive).map((b) => (
                  <li key={b.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                      <input
                        type="checkbox"
                        checked={userBranchEdit.selected.has(b.id)}
                        onChange={() => toggleUserBranch(b.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium">{b.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {allBranches.filter((b) => b.isActive).length === 0 && (
                <p className="text-sm text-gray-500">Create an active branch first.</p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setUserBranchEdit(null)} size="sm">
                  Cancel
                </Button>
                <Button type="button" onClick={saveUserBranches} disabled={submitting} size="sm">
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
