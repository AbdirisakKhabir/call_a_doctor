"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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
        {canCreate && categories.length > 0 && (
          <Link
            href="/lab/tests/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            <PlusIcon />
            Add Test
          </Link>
        )}
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
                        {canEdit && (
                          <Link
                            href={`/lab/tests/${t.id}/edit`}
                            className="inline-flex text-brand-500 hover:underline"
                            title="Edit"
                          >
                            <PencilIcon className="size-4" />
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            className="text-error-500 hover:underline"
                            title="Delete"
                          >
                            <TrashBinIcon className="size-4" />
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
          total={testTotal}
          page={page}
          pageSize={pageSize}
          noun="tests"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
