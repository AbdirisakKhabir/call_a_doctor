"use client";

import React, { useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";

export type ServiceFormValues = {
  name: string;
  description: string;
  price: string;
  durationMinutes: string;
  branchId: string;
  color: string;
};

type Branch = { id: number; name: string };

type Props = {
  title: string;
  breadcrumbTitle: string;
  backHref: string;
  initialValues: ServiceFormValues;
  branches: Branch[];
  submitLabel: string;
  onSubmit: (values: ServiceFormValues) => Promise<{ error?: string } | void>;
};

export default function ServiceForm({
  title,
  breadcrumbTitle,
  backHref,
  initialValues,
  branches,
  submitLabel,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ServiceFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await onSubmit(form);
      if (result && typeof result === "object" && result.error) {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={breadcrumbTitle} />
        <Link
          href={backHref}
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to services
        </Link>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-8">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}
          <div>
            <Label>Name *</Label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Consultation"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <Label>Price ($) *</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <Label>Duration (minutes)</Label>
            <input
              type="number"
              min="0"
              value={form.durationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
              placeholder="e.g. 30"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div>
            <Label>Branch</Label>
            <select
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Calendar color</Label>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              Used as the background for this client on the appointment calendar when this service is booked.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={
                  form.color && /^#[0-9A-Fa-f]{6}$/.test(form.color.trim())
                    ? form.color.trim()
                    : "#dbeafe"
                }
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-11 w-14 cursor-pointer rounded border border-gray-200 bg-transparent p-1 dark:border-gray-700"
                aria-label="Pick color"
              />
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#dbeafe"
                className="h-11 min-w-[8rem] flex-1 rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 font-mono text-sm dark:border-gray-700 dark:text-white"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, color: "" }))}>
                Clear
              </Button>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
            <Link
              href={backHref}
              className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-white/5"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
