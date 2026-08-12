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
import { confirmDelete, showErrorAlert } from "@/lib/swal-dialogs";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { isPagePermission, PAGE_PERMISSION_BY_KEY } from "@/lib/page-permissions";

type Permission = { id: number; name: string; module: string | null };

type RoleRow = {
  id: number;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Permission[];
};

export default function RolesPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const canCreate = hasPermission("roles.create");
  const canEdit = hasPermission("roles.edit");
  const canDelete = hasPermission("roles.delete");

  function permissionLabel(name: string): string {
    const def = PAGE_PERMISSION_BY_KEY.get(name);
    return def?.label ?? name;
  }

  async function loadRoles() {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/roles?${params}`);
    if (res.ok) {
      const body = await res.json();
      setRoles(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadRoles().finally(() => setLoading(false));
  }, [page]);

  async function handleDelete(id: number) {
    if (!(await confirmDelete({ text: "Are you sure you want to delete this role?" }))) return;
    const res = await authFetch(`/api/roles/${id}`, { method: "DELETE" });
    if (res.ok) await loadRoles();
    else {
      const data = await res.json();
      await showErrorAlert(data.error || "Failed to delete");
    }
  }

  if (!hasPermission("roles.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Roles & Permissions" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
            <svg className="h-6 w-6 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to view roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Roles & Permissions" />
        {canCreate && (
          <Link href="/roles/new">
            <Button startIcon={<PlusIcon />} size="sm">
              Add Role
            </Button>
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">All Roles</h3>
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            {loading ? "…" : total}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              No roles found. Create one to get started.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>#</TableCell>
                <TableCell isHeader>Role</TableCell>
                <TableCell isHeader>Description</TableCell>
                <TableCell isHeader>Users</TableCell>
                <TableCell isHeader>Pages</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r, idx) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-gray-400 dark:text-gray-500">
                    {(page - 1) * pageSize + idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/10">
                        <svg className="h-4 w-4 text-brand-500 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      </div>
                      {canEdit ? (
                        <Link
                          href={`/roles/${r.id}/edit`}
                          className="font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-400"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-gray-800 dark:text-white/90">{r.name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">
                    {r.description || "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/5 dark:text-gray-300">
                      {r.userCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const pagePerms = r.permissions.filter((p) => isPagePermission(p.name));
                        if (pagePerms.length === 0) {
                          return <span className="text-sm text-gray-400">—</span>;
                        }
                        return (
                          <>
                            {pagePerms.slice(0, 4).map((p) => (
                              <Badge key={p.id} color="info" size="sm">
                                {permissionLabel(p.name)}
                              </Badge>
                            ))}
                            {pagePerms.length > 4 && (
                              <Badge color="light" size="sm">
                                +{pagePerms.length - 4}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {canEdit && (
                        <Link
                          href={`/roles/${r.id}/edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                          aria-label="Edit role and pages"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && r.userCount === 0 && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
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
          noun="roles"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
