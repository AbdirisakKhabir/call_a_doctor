"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type UserRow = {
  id: number;
  email: string;
  name: string | null;
  roleId: number;
  isActive: boolean;
  createdAt: string;
  role: { name: string };
};

export default function UsersPage() {
  const { user: authUser, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const canCreate = hasPermission("users.create");
  const canEdit = hasPermission("users.edit");
  const canDelete = hasPermission("users.delete");

  async function loadUsers() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/users?${params}`);
    if (res.ok) {
      const body = await res.json();
      setUsers(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    loadUsers().finally(() => setLoading(false));
  }, [page, search]);

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    const res = await authFetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) await loadUsers();
    else {
      const data = await res.json();
      alert(data.error || "Failed to delete");
    }
  }

  if (!hasPermission("users.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Users" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
            <svg className="h-6 w-6 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to view users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Users" />
        {canCreate && (
          <Link href="/users/new">
            <Button startIcon={<PlusIcon />} size="sm">
              Add User
            </Button>
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">All Users</h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {loading ? "…" : total}
            </span>
          </div>
          <div className="relative w-full sm:w-64">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {search ? "No users match your search." : "No users yet. Create one to get started."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>#</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Email</TableCell>
                <TableCell isHeader>Role</TableCell>
                <TableCell isHeader>Status</TableCell>
                <TableCell isHeader>Joined</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u, idx) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-gray-400 dark:text-gray-500">
                    {(page - 1) * pageSize + idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </div>
                      {canEdit ? (
                        <Link
                          href={`/users/${u.id}/edit`}
                          className="font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                        >
                          {u.name || "—"}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-800 dark:text-white/90">{u.name || "—"}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge color={u.role.name === "Admin" ? "primary" : "light"} size="sm">
                      {u.role.name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color={u.isActive ? "success" : "error"} size="sm">
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {canEdit && (
                        <Link
                          href={`/users/${u.id}/edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                          aria-label="Edit user"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && authUser?.id !== u.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(u.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10"
                          aria-label="Delete"
                        >
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
          total={total}
          page={page}
          pageSize={pageSize}
          noun="users"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
