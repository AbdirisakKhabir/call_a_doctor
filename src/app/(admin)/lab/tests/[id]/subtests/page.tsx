"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TrashBinIcon } from "@/icons";

type PanelDetail = {
  id: number;
  name: string;
  price: number;
  parentTestId: number | null;
  category: { id: number; name: string };
  subtests: Array<{
    id: number;
    name: string;
    code: string | null;
    unit: string | null;
    normalRange: string | null;
  }>;
};

type DraftRow = {
  key: string;
  name: string;
  code: string;
  unit: string;
  normalRange: string;
};

function newRow(): DraftRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    code: "",
    unit: "",
    normalRange: "",
  };
}

function draftRowsHaveData(rows: DraftRow[]): boolean {
  return rows.some(
    (r) =>
      r.name.trim() !== "" ||
      r.code.trim() !== "" ||
      r.unit.trim() !== "" ||
      r.normalRange.trim() !== ""
  );
}

const inputTd =
  "px-2 py-1.5 align-middle first:pl-3 last:pr-3 sm:px-3 sm:py-2";
const fieldInput =
  "h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 sm:min-w-[6.5rem]";

export default function LabPanelSubtestsPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const panelId = Number(typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : NaN);

  const { hasPermission } = useAuth();
  const canView = hasPermission("lab.view");
  const canCreate = hasPermission("lab.create");

  const [panel, setPanel] = useState<PanelDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DraftRow[]>(() => [newRow(), newRow(), newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPanel = useCallback(async () => {
    if (!Number.isInteger(panelId) || panelId <= 0) return;
    setLoading(true);
    setLoadError("");
    const res = await authFetch(`/api/lab/tests/${panelId}`);
    const data = await res.json();
    if (!res.ok) {
      setPanel(null);
      setLoadError(typeof data.error === "string" ? data.error : "Failed to load");
      setLoading(false);
      return;
    }
    const p = data as PanelDetail;
    if (p.parentTestId != null) {
      setPanel(null);
      setLoadError("This test is already a sub-test. Open a top-level panel to manage its sub-tests.");
      setLoading(false);
      return;
    }
    setPanel(p);
    setLoading(false);
  }, [panelId]);

  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function addRows(howMany: number) {
    const n = Math.max(1, Math.min(40, Math.floor(howMany)));
    setRows((prev) => [...prev, ...Array.from({ length: n }, () => newRow())]);
  }

  const navigateAway = useCallback(
    async (href: string) => {
      if (canCreate && draftRowsHaveData(rows)) {
        const res = await Swal.fire({
          icon: "warning",
          title: "Discard unsaved data?",
          text: "You have data in new sub-test rows that is not saved. Leave and discard it?",
          showCancelButton: true,
          confirmButtonText: "Yes",
          cancelButtonText: "No",
          reverseButtons: true,
        });
        if (!res.isConfirmed) return;
      }
      router.push(href);
    },
    [canCreate, rows, router]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || !panel) return;
    setFormError("");
    setSuccess("");
    const items = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        code: r.code.trim() || undefined,
        unit: r.unit.trim() || undefined,
        normalRange: r.normalRange.trim() || undefined,
      }));
    if (items.length === 0) {
      setFormError("Enter at least one sub-test name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/lab/tests/${panelId}/subtests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setSuccess(`Added ${data.createdCount ?? items.length} sub-test(s).`);
      setRows([newRow(), newRow()]);
      await loadPanel();
    } finally {
      setSubmitting(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Panel sub-tests" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!Number.isInteger(panelId) || panelId <= 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Panel sub-tests" />
        <p className="mt-4 text-sm text-gray-500">Invalid test.</p>
        <Link href="/lab/tests" className="mt-2 inline-block text-brand-600 hover:underline">
          Back to tests
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Panel sub-tests" />
        <div className="mt-8 text-center text-gray-500">Loading…</div>
      </div>
    );
  }

  if (loadError || !panel) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Panel sub-tests" />
        <p className="mt-4 text-sm text-error-600 dark:text-error-400">{loadError || "Not found."}</p>
        <Link href="/lab/tests" className="mt-2 inline-block text-brand-600 hover:underline">
          Back to tests
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={`Sub-tests · ${panel.name}`} />
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            onClick={() => void navigateAway(`/lab/tests/${panelId}/edit`)}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Edit panel
          </button>
          <button
            type="button"
            onClick={() => void navigateAway("/lab/tests")}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            ← All tests
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Panel <span className="font-semibold text-gray-900 dark:text-white">{panel.name}</span> · Category{" "}
          {panel.category.name} · Panel fee ${panel.price.toFixed(2)}
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Sub-tests do not have their own fee. Billing uses the panel price above only; the system splits that amount
          across result lines for accounting.
        </p>
      </div>

      {panel.subtests.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Current sub-tests ({panel.subtests.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[44rem] divide-y divide-gray-200 dark:divide-gray-700">
              <TableHeader className="sticky top-0 z-[1] shadow-[0_1px_0_0_rgb(229_231_235)] dark:shadow-[0_1px_0_0_rgb(55_65_81)]">
                <TableRow className="hover:bg-transparent">
                  <TableCell isHeader className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                    #
                  </TableCell>
                  <TableCell isHeader className="min-w-[10rem] whitespace-nowrap px-3 py-2.5 sm:px-4">
                    Name
                  </TableCell>
                  <TableCell isHeader className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                    Code
                  </TableCell>
                  <TableCell isHeader className="whitespace-nowrap px-3 py-2.5 sm:px-4">
                    Unit
                  </TableCell>
                  <TableCell isHeader className="min-w-[8rem] whitespace-nowrap px-3 py-2.5 sm:px-4">
                    Normal range
                  </TableCell>
                  <TableCell isHeader className="w-14 whitespace-nowrap px-2 py-2.5 text-right sm:px-4">
                    <span className="sr-only">Actions</span>
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {panel.subtests.map((s, idx) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">{idx + 1}</TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-white">{s.name}</TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">{s.code || "—"}</TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">{s.unit || "—"}</TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      <span className="block max-w-xs truncate" title={s.normalRange?.trim() ? s.normalRange : undefined}>
                        {s.normalRange?.trim() ? s.normalRange : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/lab/tests/${s.id}/edit`}
                        className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!canCreate ? (
        <p className="text-sm text-gray-500">You need lab create permission to add sub-tests.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add sub-tests</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Use the table below. Scroll horizontally on narrow screens. Add blank rows as needed, then submit. Empty
                name rows are ignored.
              </p>

              {formError && (
                <div className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {formError}
                </div>
              )}
              {success && (
                <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {success}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Rows:</span>
                <Button type="button" variant="outline" size="sm" onClick={() => addRows(1)}>
                  +1
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addRows(5)}>
                  +5
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addRows(10)}>
                  +10
                </Button>
              </div>
            </div>

            <div className="max-h-[min(70vh,28rem)] overflow-auto">
              <Table className="min-w-[52rem] w-full divide-y divide-gray-200 dark:divide-gray-700">
                <TableHeader className="sticky top-0 z-[1] bg-gray-50 shadow-[0_1px_0_0_rgb(229_231_235)] dark:bg-gray-900/95 dark:shadow-[0_1px_0_0_rgb(55_65_81)]">
                  <TableRow className="hover:bg-transparent">
                    <TableCell isHeader className="whitespace-nowrap px-2 py-2 text-xs sm:px-3 sm:text-[0.7rem]">
                      #
                    </TableCell>
                    <TableCell isHeader className="min-w-[11rem] whitespace-nowrap px-2 py-2 text-xs sm:px-3 sm:text-[0.7rem]">
                      Name *
                    </TableCell>
                    <TableCell isHeader className="whitespace-nowrap px-2 py-2 text-xs sm:px-3 sm:text-[0.7rem]">
                      Code
                    </TableCell>
                    <TableCell isHeader className="whitespace-nowrap px-2 py-2 text-xs sm:px-3 sm:text-[0.7rem]">
                      Unit
                    </TableCell>
                    <TableCell isHeader className="min-w-[9rem] whitespace-nowrap px-2 py-2 text-xs sm:px-3 sm:text-[0.7rem]">
                      Normal range
                    </TableCell>
                    <TableCell isHeader className="w-11 whitespace-nowrap px-1 py-2 text-right text-xs sm:w-12 sm:px-2 sm:text-[0.7rem]">
                      <span className="sr-only">Remove</span>
                      Del
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={row.key}>
                      <TableCell className={`${inputTd} tabular-nums text-xs text-gray-500 dark:text-gray-400`}>
                        {idx + 1}
                      </TableCell>
                      <TableCell className={`${inputTd} min-w-[11rem]`}>
                        <input
                          aria-label={`Row ${idx + 1} name`}
                          value={row.name}
                          onChange={(e) => updateRow(row.key, { name: e.target.value })}
                          className={fieldInput}
                          placeholder="e.g. WBC"
                        />
                      </TableCell>
                      <TableCell className={`${inputTd}`}>
                        <input
                          aria-label={`Row ${idx + 1} code`}
                          value={row.code}
                          onChange={(e) => updateRow(row.key, { code: e.target.value })}
                          className={fieldInput}
                        />
                      </TableCell>
                      <TableCell className={`${inputTd}`}>
                        <input
                          aria-label={`Row ${idx + 1} unit`}
                          value={row.unit}
                          onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                          className={fieldInput}
                          placeholder="mg/dL"
                        />
                      </TableCell>
                      <TableCell className={`${inputTd} min-w-[9rem]`}>
                        <input
                          aria-label={`Row ${idx + 1} normal range`}
                          value={row.normalRange}
                          onChange={(e) => updateRow(row.key, { normalRange: e.target.value })}
                          className={fieldInput}
                          placeholder="70–100"
                        />
                      </TableCell>
                      <TableCell className={`${inputTd} w-11 text-right sm:w-12`}>
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length <= 1}
                          className="inline-flex rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                          aria-label={`Remove row ${idx + 1}`}
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void navigateAway("/lab/tests")}>
              Back to list
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Create sub-tests"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
