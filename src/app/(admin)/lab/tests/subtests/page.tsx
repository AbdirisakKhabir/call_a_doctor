"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PencilIcon, TrashBinIcon } from "@/icons";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type SubtestRow = {
  id: number;
  name: string;
  code: string | null;
  unit: string | null;
  normalRange: string | null;
  price: number;
  isActive: boolean;
  category: { id: number; name: string };
  parentTest: { id: number; name: string } | null;
};

export default function LabSubtestsListPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<SubtestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);

  const canEdit = hasPermission("lab.edit");
  const canDelete = hasPermission("lab.delete");

  async function load() {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      scope: "subtests",
    });
    const res = await authFetch(`/api/lab/tests?${params}`);
    if (res.ok) {
      const body = await res.json();
      setRows((body.data ?? []) as SubtestRow[]);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [page]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this sub-test?")) return;
    const res = await authFetch(`/api/lab/tests/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert((await res.json()).error || "Failed");
  }

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab sub-tests" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Lab sub-tests" />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/lab/tests" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← All tests & panels
          </Link>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Sub-tests belong to a panel; fees are set on the panel. Use{" "}
        <Link href="/lab/tests" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          Tests
        </Link>{" "}
        to open a panel’s <strong>Sub-tests</strong> page and add multiple lines.
      </p>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : total === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No sub-tests yet. Create a panel test, then use <strong>Sub-tests</strong> on that row to add lines.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>Sub-test</TableCell>
                  <TableCell isHeader>Panel</TableCell>
                  <TableCell isHeader>Category</TableCell>
                  <TableCell isHeader>Code</TableCell>
                  <TableCell isHeader>Unit</TableCell>
                  <TableCell isHeader>Normal range</TableCell>
                  <TableCell isHeader>Active</TableCell>
                  {(canEdit || canDelete) && <TableCell isHeader>Actions</TableCell>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">{t.name}</TableCell>
                    <TableCell>
                      {t.parentTest ? (
                        <Link
                          href={`/lab/tests/${t.parentTest.id}/subtests`}
                          className="text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {t.parentTest.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{t.category.name}</TableCell>
                    <TableCell>{t.code || "—"}</TableCell>
                    <TableCell>{t.unit || "—"}</TableCell>
                    <TableCell className="max-w-[12rem]">
                      <span className="block truncate" title={t.normalRange ?? undefined}>
                        {t.normalRange || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          t.isActive
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-gray-400 line-through dark:text-gray-500"
                        }
                      >
                        {t.isActive ? "Yes" : "No"}
                      </span>
                    </TableCell>
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
          </div>
        )}

        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="sub-tests"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
