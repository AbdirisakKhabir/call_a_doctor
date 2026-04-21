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
  category: { id: number; name: string };
};

export default function EditLabTestPage() {
  const router = useRouter();
  const params = useParams();
  const testIdRaw = params?.id;
  const testId = Number(typeof testIdRaw === "string" ? testIdRaw : Array.isArray(testIdRaw) ? testIdRaw[0] : NaN);

  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [categories, setCategories] = useState<LabCategory[]>([]);
  const [test, setTest] = useState<LabTest | null>(null);
  const [form, setForm] = useState({ categoryId: "", name: "", code: "", unit: "", normalRange: "", price: "" });
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
    if (!canEdit || !Number.isInteger(testId) || testId <= 0) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/lab/tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(form.categoryId),
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
