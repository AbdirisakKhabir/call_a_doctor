"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import {
  groupPagesBySection,
  isPagePermission,
} from "@/lib/page-permissions";

export type PermissionOption = {
  id: number;
  name: string;
  module: string | null;
  description?: string | null;
};

export type RoleFormValues = {
  name: string;
  description: string;
  permissionIds: number[];
};

type RolePermissionsFormProps = {
  initialValues: RoleFormValues;
  submitLabel: string;
  submitting: boolean;
  submitError: string;
  onSubmit: (values: RoleFormValues) => void | Promise<void>;
};

export default function RolePermissionsForm({
  initialValues,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
}: RolePermissionsFormProps) {
  // Initialise once; never re-sync from props so checkbox changes don't get reset.
  const [form, setForm] = useState<RoleFormValues>(() => initialValues);
  const [allPermissions, setAllPermissions] = useState<PermissionOption[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [showActions, setShowActions] = useState(false);

  // When the parent loads real data (e.g. edit page fetches the role), apply it once.
  const initializedRef = React.useRef(false);
  useEffect(() => {
    // Only apply if the form still has the empty default values (i.e. hasn't been edited).
    if (!initializedRef.current && (initialValues.name || initialValues.permissionIds.length > 0)) {
      initializedRef.current = true;
      setForm(initialValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues.name, initialValues.permissionIds.length]);

  useEffect(() => {
    authFetch("/api/permissions")
      .then(async (res) => {
        if (res.ok) setAllPermissions(await res.json());
      })
      .finally(() => setLoadingPermissions(false));
  }, []);

  const pageGroups = useMemo(() => {
    const pagePerms = allPermissions.filter((p) => isPagePermission(p.name));
    const byKey = new Map(pagePerms.map((p) => [p.name, p]));
    return groupPagesBySection().map((group) => ({
      ...group,
      pages: group.pages
        .map((def) => {
          const perm = byKey.get(def.permission);
          return perm ? { def, perm } : null;
        })
        .filter(Boolean) as { def: (typeof group.pages)[0]; perm: PermissionOption }[],
    }));
  }, [allPermissions]);

  const actionPermissions = useMemo(
    () => allPermissions.filter((p) => !isPagePermission(p.name)),
    [allPermissions]
  );

  const actionByModule = useMemo(
    () =>
      actionPermissions.reduce<Record<string, PermissionOption[]>>((acc, p) => {
        const m = p.module || "other";
        if (!acc[m]) acc[m] = [];
        acc[m].push(p);
        return acc;
      }, {}),
    [actionPermissions]
  );

  const selectedPageCount = form.permissionIds.filter((id) => {
    const p = allPermissions.find((x) => x.id === id);
    return p && isPagePermission(p.name);
  }).length;

  function togglePermission(permId: number) {
    setForm((f) => ({
      ...f,
      permissionIds: f.permissionIds.includes(permId)
        ? f.permissionIds.filter((id) => id !== permId)
        : [...f.permissionIds, permId],
    }));
  }

  function toggleSectionPages(pages: { perm: PermissionOption }[], checked: boolean) {
    const ids = pages.map((x) => x.perm.id);
    setForm((f) => ({
      ...f,
      permissionIds: checked
        ? [...new Set([...f.permissionIds, ...ids])]
        : f.permissionIds.filter((id) => !ids.includes(id)),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {submitError && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {submitError}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
        <h2 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Role details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span className="text-error-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Purchasing clerk"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description of this role"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Pages</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Choose which pages appear in the sidebar for this role. Only selected pages are shown,
            grouped by section.
          </p>
          <p className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400">
            {selectedPageCount} page{selectedPageCount !== 1 ? "s" : ""} selected
          </p>
        </div>

        {loadingPermissions ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {pageGroups.map((group) => {
              const allChecked = group.pages.every((x) => form.permissionIds.includes(x.perm.id));
              const sectionCount = group.pages.filter((x) =>
                form.permissionIds.includes(x.perm.id)
              ).length;
              return (
                <section key={group.section} className="px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        {group.title}
                      </h3>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        {sectionCount} of {group.pages.length} selected
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSectionPages(group.pages, !allChecked)}
                      className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {allChecked ? "Clear section" : "Select all"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.pages.map(({ def, perm }) => {
                      const checked = form.permissionIds.includes(perm.id);
                      return (
                        <button
                          key={perm.id}
                          type="button"
                          aria-pressed={checked}
                          title={def.path}
                          onClick={() => togglePermission(perm.id)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            checked
                              ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                              : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              checked
                                ? "border-brand-500 bg-brand-500 text-white"
                                : "border-gray-300 dark:border-gray-600"
                            }`}
                          >
                            {checked ? (
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : null}
                          </span>
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <button
          type="button"
          onClick={() => setShowActions((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Actions & capabilities
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Create, edit, delete, and other operations — not sidebar visibility
            </p>
          </div>
          <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
            {showActions ? "Hide" : "Show"} ({actionPermissions.length})
          </span>
        </button>
        {showActions && !loadingPermissions && (
          <div className="space-y-4 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            {Object.entries(actionByModule).map(([module, perms]) => (
              <div key={module}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {module}
                </p>
                <div className="flex flex-wrap gap-2">
                  {perms.map((p) => {
                    const checked = form.permissionIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => togglePermission(p.id)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                          checked
                            ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
        <Link
          href="/roles"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={submitting || loadingPermissions}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
