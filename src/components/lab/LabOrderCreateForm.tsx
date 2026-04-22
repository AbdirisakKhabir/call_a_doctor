"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { TrashBinIcon } from "@/icons";

export type LabTestOption = { id: number; name: string; price: number; category: { name: string } };

type Props = {
  appointmentId: number;
  patientId: number;
  doctorId: number;
};

export default function LabOrderCreateForm({ appointmentId, patientId, doctorId }: Props) {
  const router = useRouter();
  const [tests, setTests] = useState<LabTestOption[]>([]);
  const [createForm, setCreateForm] = useState({ notes: "", testIds: [] as number[] });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [testSearch, setTestSearch] = useState("");

  const selectedLabFee = useMemo(() => {
    return createForm.testIds.reduce((sum, id) => {
      const t = tests.find((x) => x.id === id);
      return sum + (t?.price ?? 0);
    }, 0);
  }, [createForm.testIds, tests]);

  const selectedTestsOrdered = useMemo(() => {
    return createForm.testIds
      .map((id) => tests.find((t) => t.id === id))
      .filter((t): t is LabTestOption => Boolean(t));
  }, [createForm.testIds, tests]);

  const filteredTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => {
      const cat = t.category.name.toLowerCase();
      return t.name.toLowerCase().includes(q) || cat.includes(q);
    });
  }, [tests, testSearch]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/lab/tests")
      .then(async (tRes) => {
        if (!tRes.ok) return;
        const data = await tRes.json();
        const list = Array.isArray(data) ? data : data.data ?? [];
        if (!cancelled) setTests(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateOrder() {
    if (createForm.testIds.length === 0) return;
    setCreateSubmitting(true);
    try {
      const res = await authFetch("/api/lab/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          patientId,
          doctorId,
          notes: createForm.notes || null,
          testIds: createForm.testIds,
        }),
      });
      if (res.ok) {
        router.push("/lab/orders");
        router.refresh();
      } else {
        const j = await res.json();
        alert(typeof j.error === "string" ? j.error : "Failed");
      }
    } finally {
      setCreateSubmitting(false);
    }
  }

  function toggleTest(id: number) {
    setCreateForm((f) => ({
      ...f,
      testIds: f.testIds.includes(id) ? f.testIds.filter((x) => x !== id) : [...f.testIds, id],
    }));
  }

  function removeTest(id: number) {
    setCreateForm((f) => ({ ...f, testIds: f.testIds.filter((x) => x !== id) }));
  }

  return (
    <div className="min-h-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6">
      <div className="grid min-h-0 gap-6 md:grid-cols-2 md:items-start">
        <div className="flex min-h-0 min-w-0 flex-col">
          <Label>Tests</Label>
          <input
            type="search"
            value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            placeholder="Search by name or category"
            className="mt-1 h-11 w-full shrink-0 rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          />
          <p className="mt-1 shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {filteredTests.length} of {tests.length}
            {testSearch.trim() ? ` · “${testSearch.trim()}”` : ""}
          </p>
          <div className="mt-2 flex min-h-40 max-h-[min(24rem,55dvh)] flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]">
              {filteredTests.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {tests.length === 0 ? "No tests loaded." : "No matches."}
                  {testSearch.trim() ? (
                    <button
                      type="button"
                      onClick={() => setTestSearch("")}
                      className="mt-2 block w-full text-sm font-medium text-brand-600 dark:text-brand-400"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {filteredTests.map((t) => {
                    const checked = createForm.testIds.includes(t.id);
                    return (
                      <li key={t.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 ${
                            checked ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTest(t.id)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-900 dark:text-white">{t.name}</p>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{t.category.name}</p>
                          </div>
                          <span className="shrink-0 text-sm tabular-nums text-gray-800 dark:text-gray-200">
                            ${(t.price ?? 0).toFixed(2)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Label>Selected</Label>
            <span className="text-xs text-gray-500 dark:text-gray-400">{createForm.testIds.length}</span>
          </div>
          <div className="mt-1 flex min-h-40 max-h-[min(24rem,55dvh)] flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {selectedTestsOrdered.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                None selected.
              </div>
            ) : (
              <ol className="min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]">
                {selectedTestsOrdered.map((t, index) => (
                  <li
                    key={t.id}
                    className="mb-1 flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2 py-2 last:mb-0 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <span className="w-6 shrink-0 text-center text-xs text-gray-500 dark:text-gray-400">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-900 dark:text-white">{t.name}</p>
                      <p className="truncate text-xs text-gray-500">{t.category.name}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-gray-800 dark:text-gray-200">${(t.price ?? 0).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => removeTest(t.id)}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label={`Remove ${t.name}`}
                    >
                      <TrashBinIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
            <span className="text-sm text-gray-700 dark:text-gray-300">Total</span>
            <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">${selectedLabFee.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">
        <Label>Notes (optional)</Label>
        <textarea
          value={createForm.notes}
          onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Notes for the lab"
        />
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <Button variant="outline" size="sm" type="button" onClick={() => router.push("/lab/orders")}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={createSubmitting || createForm.testIds.length === 0}
            onClick={() => void handleCreateOrder()}
          >
            {createSubmitting ? "Creating…" : `Create${createForm.testIds.length > 0 ? ` (${createForm.testIds.length})` : ""}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
