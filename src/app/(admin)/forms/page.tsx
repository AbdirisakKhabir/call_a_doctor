"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";

type FormRow = {
  id: number;
  title: string;
  description: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { fields: number };
  createdBy: { id: number; name: string | null; email: string } | null;
};

export default function FormsListPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("forms.view");
  const canCreate = hasPermission("forms.create");
  const canEdit = hasPermission("forms.edit");
  const canDelete = hasPermission("forms.delete");

  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await authFetch("/api/forms");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [canView]);

  async function handleDelete(id: number, title: string) {
    if (!canDelete) return;
    if (!confirm(`Delete form “${title}”? This cannot be undone.`)) return;
    const res = await authFetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else {
      const j = await res.json();
      alert(typeof j.error === "string" ? j.error : "Delete failed");
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Forms" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to view forms.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Forms" />
        {canCreate ? (
          <Link href="/forms/new">
            <Button size="sm">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              New form
            </Button>
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No forms yet.{canCreate ? " Create one to get started." : ""}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Title</TableCell>
                <TableCell isHeader>Fields</TableCell>
                <TableCell isHeader>Status</TableCell>
                <TableCell isHeader>Updated</TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-medium text-gray-900 dark:text-white">{r.title}</span>
                    {r.createdBy?.name || r.createdBy?.email ? (
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {r.createdBy?.name || r.createdBy?.email}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{r._count.fields}</TableCell>
                  <TableCell>
                    {r.isPublished ? (
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">Published</span>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Draft</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(r.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit ? (
                        <Link
                          href={`/forms/${r.id}`}
                          className="inline-flex rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-white"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(r.id, r.title)}
                          className="inline-flex rounded p-1 text-gray-500 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
                          title="Delete"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
