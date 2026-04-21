"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import LabTestDisposablesFields, {
  type BranchOpt,
  type PendingDisposableRow,
} from "@/components/lab/LabTestDisposablesFields";

type LabCategory = { id: number; name: string };

export default function NewLabTestPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [categories, setCategories] = useState<LabCategory[]>([]);
  const [form, setForm] = useState({ categoryId: "", name: "", code: "", unit: "", normalRange: "", price: "" });
  const [pendingDisposables, setPendingDisposables] = useState<PendingDisposableRow[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [disposableBranchId, setDisposableBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canCreate = hasPermission("lab.create");

  useEffect(() => {
    authFetch("/api/lab/categories")
      .then(async (r) => {
        if (!r.ok) return;
        const list = await r.json();
        if (Array.isArray(list) && list.length > 0) {
          setCategories(list.map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })));
          setForm((f) => ({ ...f, categoryId: String(list[0].id) }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (!cancelled && Array.isArray(list)) {
          setBranches(list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (singleAssignedBranchId && !disposableBranchId) {
      setDisposableBranchId(String(singleAssignedBranchId));
    } else if (!disposableBranchId && branches.length > 0) {
      setDisposableBranchId(String(branches[0].id));
    }
  }, [singleAssignedBranchId, branches, disposableBranchId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await authFetch("/api/lab/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(form.categoryId),
          name: form.name,
          code: form.code,
          unit: form.unit,
          normalRange: form.normalRange,
          price: form.price === "" ? 0 : Number(form.price),
          disposables: pendingDisposables.map((d) => ({
            productCode: d.productCode,
            unitsPerTest: d.unitsPerTest,
            deductionUnitKey: d.deductionUnitKey,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create test");
        return;
      }
      router.push("/lab/tests");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab test" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab test" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission to create lab tests.</p>
        <Link href="/lab/tests" className="mt-2 inline-block text-brand-600 hover:underline">
          Back to tests
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New lab test" />
        <Link
          href="/lab/tests"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to list
        </Link>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          Add a lab category first, then you can create tests.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Test details</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="cat">Category *</Label>
                <select
                  id="cat"
                  required
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">Select</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="name">Name *</Label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <Label htmlFor="code">Code</Label>
                <input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  placeholder="e.g. mg/dL"
                />
              </div>
              <div>
                <Label htmlFor="range">Normal Range</Label>
                <input
                  id="range"
                  value={form.normalRange}
                  onChange={(e) => setForm((f) => ({ ...f, normalRange: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  placeholder="e.g. 70-100"
                />
              </div>
              <div>
                <Label htmlFor="price">Test price ($)</Label>
                <input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-500">Charged to the client when this test is ordered.</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
            <LabTestDisposablesFields
              mode="pending"
              rows={pendingDisposables}
              onRowsChange={setPendingDisposables}
              branches={branches}
              disposableBranchId={disposableBranchId}
              onDisposableBranchIdChange={setDisposableBranchId}
            />
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push("/lab/tests")} size="sm">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Creating…" : "Create test"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
