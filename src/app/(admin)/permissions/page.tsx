"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Permission = {
  id: number;
  name: string;
  description: string | null;
  module: string | null;
};

/** User-facing module title; API still uses slug keys like `patients`. */
function formatModuleTitle(module: string) {
  if (module === "patients") return "Clients";
  if (module === "appointments") return "Calendar";
  return module;
}

const MODULE_COLORS: Record<string, "primary" | "success" | "warning" | "info" | "error"> = {
  users: "primary",
  roles: "success",
  permissions: "warning",
  dashboard: "info",
  pharmacy: "success",
  appointments: "info",
  patients: "primary",
  accounts: "warning",
  settings: "info",
  expenses: "error",
  financial: "success",
  lab: "info",
};

export default function PermissionsPage() {
  const { hasPermission } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await authFetch("/api/permissions");
      if (res.ok) {
        const data = await res.json();
        setPermissions(data);
      }
      setLoading(false);
    })();
  }, []);

  if (!hasPermission("permissions.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Permissions" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
            <svg className="h-6 w-6 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to view permissions.
          </p>
        </div>
      </div>
    );
  }

  const byModule = permissions.reduce<Record<string, Permission[]>>(
    (acc, p) => {
      const m = p.module || "other";
      if (!acc[m]) acc[m] = [];
      acc[m].push(p);
      return acc;
    },
    {}
  );

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Permissions" />
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Permissions are assigned to roles. Manage them from the{" "}
          <a
            href="/roles"
            className="font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
          >
            Roles
          </a>{" "}
          page.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
          <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
            {permissions.length}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Total Permissions
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
          <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
            {Object.keys(byModule).length}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Modules
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byModule).map(([module, perms]) => {
            const color = MODULE_COLORS[module] || "light";
            return (
              <div
                key={module}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"
              >
                {/* Module Header */}
                <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/5">
                    <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold capitalize text-gray-800 dark:text-white/90">
                      {formatModuleTitle(module)}
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {perms.length} permission{perms.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Permissions Grid */}
                <div className="grid gap-px bg-gray-100 dark:bg-gray-800 sm:grid-cols-2">
                  {perms.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-3 bg-white px-5 py-4 dark:bg-white/3"
                    >
                      <Badge color={color} size="sm" variant="solid">
                        {p.name.split(".").pop()}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {p.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {p.description || "No description"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
