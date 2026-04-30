"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import LabTestDisposablesFields, { type BranchOpt } from "@/components/lab/LabTestDisposablesFields";

type LabCategory = { id: number; name: string };

type LabTest = {
  id: number;
  name: string;
  code: string | null;
  unit: string | null;
  normalRange: string | null;
  price: number;
  parentTestId: number | null;
  category: { id: number; name: string };
  parentTest: { id: number; name: string } | null;
  subtests: { id: number; name: string }[];
};

export default function EditLabTestPage() {
  const router = useRouter();
  const params = useParams();
  const testIdRaw = params?.id;
  const testId = Number(typeof testIdRaw === "string" ? testIdRaw : Array.isArray(testIdRaw) ? testIdRaw[0] : NaN);

  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [categories, setCategories] = useState<LabCategory[]>([]);
  const [panelRoots, setPanelRoots] = useState<{ id: number; name: string }[]>([]);
  const [test, setTest] = useState<LabTest | null>(null);
  const [form, setForm] = useState({
    categoryId: "",
    parentPanelId: "",
    name: "",
    code: "",
    unit: "",
    normalRange: "",
    price: "",
  });
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [disposableBranchId, setDisposableBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canEdit = hasPermission("lab.edit");

  useEffect(() => {
    authFetch("/api/lab/categories")
      .then(async (r) => {
        if (!r.ok) return;
        const list = await r.json();
        if (Array.isArray(list)) {
          setCategories(list.map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })));
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
    if (!test || test.subtests.length > 0) {
      setPanelRoots([]);
      return;
    }
    let cancelled = false;
    authFetch("/api/lab/tests")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        const list = Array.isArray(data) ? data : data.data ?? [];
        if (!cancelled && Array.isArray(list)) {
          setPanelRoots(
            list
              .filter((t: { id: number; parentTestId?: number | null }) => t.parentTestId == null && t.id !== testId)
              .map((t: { id: number; name: string }) => ({ id: t.id, name: t.name }))
              .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [test, testId]);

  useEffect(() => {
    if (singleAssignedBranchId && !disposableBranchId) {
      setDisposableBranchId(String(singleAssignedBranchId));
    } else if (!disposableBranchId && branches.length > 0) {
      setDisposableBranchId(String(branches[0].id));
    }
  }, [singleAssignedBranchId, branches, disposableBranchId]);

  useEffect(() => {
    if (!Number.isInteger(testId) || testId <= 0) {
      setLoading(false);
      setTest(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/lab/tests/${testId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || cancelled) return;
        const t = data as LabTest;
        setTest(t);
        setForm({
          categoryId: String(t.category.id),
          parentPanelId: t.parentTestId != null ? String(t.parentTestId) : "",
          name: t.name,
          code: t.code ?? "",
          unit: t.unit ?? "",
          normalRange: t.normalRange ?? "",
          price: String(t.price ?? 0),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [testId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !Number.isInteger(testId) || testId <= 0 || !test) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/lab/tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(form.categoryId),
          parentTestId: test.subtests.length > 0 ? null : form.parentPanelId === "" ? null : Number(form.parentPanelId),
          name: form.name,
          code: form.code,
          unit: form.unit,
          normalRange: form.normalRange,
          price: form.price === "" ? 0 : Number(form.price),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
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
        <PageBreadCrumb pageTitle="Edit lab test" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (!Number.isInteger(testId) || testId <= 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit lab test" />
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
        <PageBreadCrumb pageTitle="Edit lab test" />
        <div className="mt-8 text-center text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!test) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit lab test" />
        <p className="mt-4 text-sm text-gray-500">Test not found.</p>
        <Link href="/lab/tests" className="mt-2 inline-block text-brand-600 hover:underline">
          Back to tests
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={`Edit: ${test.name}`} />
        <Link
          href="/lab/tests"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to list
        </Link>
      </div>

      {!canEdit ? (
        <p className="text-sm text-gray-500">You do not have permission to edit lab tests.</p>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          {!test.parentTestId && (
            <section className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 dark:border-brand-800 dark:bg-brand-900/25">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sub-tests</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {test.subtests.length > 0
                  ? `This panel has ${test.subtests.length} sub-test${test.subtests.length === 1 ? "" : "s"}. Add several at once or edit existing lines on the sub-tests page.`
                  : "Add multiple sub-test lines under this panel in one form (name, unit, normal range, price per line)."}
              </p>
              <Link
                href={`/lab/tests/${testId}/subtests`}
                className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
              >
                Manage sub-tests
              </Link>
            </section>
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
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {test.subtests.length === 0 && (
              <div>
                <Label htmlFor="parentPanel">Panel parent</Label>
                <select
                  id="parentPanel"
                  value={form.parentPanelId}
                  onChange={(e) => setForm((f) => ({ ...f, parentPanelId: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">None — top-level test or panel</option>
                  {panelRoots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Turn this test into a sub-test of another panel, or clear to make it top-level. To add many sub-tests under
                  <em> this </em>
                  panel, use <Link href={`/lab/tests/${testId}/subtests`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">Manage sub-tests</Link>.
                </p>
              </div>
              )}
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
              {!test.parentTestId ? (
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
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  For a panel with sub-tests, this fee is the only amount charged; it is split across lab result lines.
                </p>
              </div>
              ) : (
              <div>
                <Label>Test price ($)</Label>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Sub-tests have no separate fee. Set the price on the panel test ({test.parentTest?.name ?? "parent"}).
                </p>
              </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
            <LabTestDisposablesFields
              mode="saved"
              testId={testId}
              canEdit={canEdit}
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
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
