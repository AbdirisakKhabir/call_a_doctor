"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";

export type RoleOption = {
  id: number;
  name: string;
  description: string | null;
};

export type UserFormValues = {
  email: string;
  password: string;
  name: string;
  roleId: string;
  isActive?: boolean;
};

type UserFormProps = {
  mode: "create" | "edit";
  initialValues: UserFormValues;
  submitLabel: string;
  submitting: boolean;
  submitError: string;
  onSubmit: (values: UserFormValues) => void | Promise<void>;
};

export default function UserForm({
  mode,
  initialValues,
  submitLabel,
  submitting,
  submitError,
  onSubmit,
}: UserFormProps) {
  const [form, setForm] = useState<UserFormValues>(() => initialValues);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState("");

  // Only apply incoming initialValues once when real data arrives (edit page fetch).
  const initializedRef = React.useRef(false);
  useEffect(() => {
    if (!initializedRef.current && initialValues.email) {
      initializedRef.current = true;
      setForm(initialValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues.email]);

  useEffect(() => {
    setLoadingRoles(true);
    setRolesError("");
    authFetch("/api/roles?all=true")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setRolesError(data.error || "Failed to load roles");
          setRoles([]);
          return;
        }
        const list = Array.isArray(data) ? data : (data.data ?? []);
        setRoles(list as RoleOption[]);
        if (mode === "create" && list.length > 0 && !initialValues.roleId) {
          setForm((f) => ({ ...f, roleId: String(list[0].id) }));
        }
      })
      .catch(() => {
        setRolesError("Failed to load roles");
        setRoles([]);
      })
      .finally(() => setLoadingRoles(false));
  }, [mode, initialValues.roleId]);

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
        <h2 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">Account</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email <span className="text-error-500">*</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@clinic.local"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Full name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="John Doe"
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password{" "}
              {mode === "edit" ? (
                <span className="font-normal text-gray-400">(leave blank to keep)</span>
              ) : (
                <span className="text-error-500">*</span>
              )}
            </label>
            <input
              type="password"
              required={mode === "create"}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={mode === "edit" ? "••••••••" : "Min 6 characters"}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
            />
          </div>
          {mode === "edit" && typeof form.isActive === "boolean" ? (
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-gray-300 text-brand-600"
                />
                Active account
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">Role</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            The role determines which pages appear in the sidebar and what actions the user can perform.
          </p>
        </div>

        {loadingRoles ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : rolesError ? (
          <div className="px-5 py-8 text-center text-sm text-error-600 dark:text-error-400">{rolesError}</div>
        ) : roles.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No roles found.{" "}
            <Link href="/roles/new" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
              Create a role
            </Link>{" "}
            first.
          </div>
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => {
              const selected = form.roleId === String(role.id);
              return (
                <label
                  key={role.id}
                  className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-colors ${
                    selected
                      ? "border-brand-400 bg-brand-50 ring-1 ring-brand-400 dark:border-brand-500 dark:bg-brand-500/10 dark:ring-brand-500"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleId"
                    value={String(role.id)}
                    checked={selected}
                    onChange={() => setForm((f) => ({ ...f, roleId: String(role.id) }))}
                    className="absolute left-4 top-4 h-4 w-4 accent-brand-600"
                    required
                  />
                  <span className="pl-7 font-semibold text-gray-800 dark:text-white/90">{role.name}</span>
                  <span className="mt-1 pl-7 text-xs text-gray-500 dark:text-gray-400">
                    {role.description?.trim() || "No description"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
        <Link
          href="/users"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={submitting || loadingRoles || roles.length === 0}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
