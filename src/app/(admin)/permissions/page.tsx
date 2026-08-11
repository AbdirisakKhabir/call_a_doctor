"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  groupPagesBySection,
  isPagePermission,
} from "@/lib/page-permissions";

type Permission = {
  id: number;
  name: string;
  description: string | null;
  module: string | null;
};

/** User-facing module title for action permissions */
function formatActionModuleTitle(module: string) {
  if (module === "patients") return "Clients";
  if (module === "appointments") return "Calendar";
  return module.charAt(0).toUpperCase() + module.slice(1);
}

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

  const pageGroups = useMemo(() => {
    const pagePerms = permissions.filter((p) => isPagePermission(p.name));
    const byKey = new Map(pagePerms.map((p) => [p.name, p]));
    return groupPagesBySection().map((group) => ({
      ...group,
      pages: group.pages
        .map((def) => {
          const perm = byKey.get(def.permission);
          return perm ? { def, perm } : null;
        })
        .filter(Boolean) as { def: (typeof group.pages)[0]; perm: Permission }[],
    }));
  }, [permissions]);

  const actionPermissions = useMemo(
    () => permissions.filter((p) => !isPagePermission(p.name)),
    [permissions]
  );

  const actionByModule = useMemo(
    () =>
      actionPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
        const m = p.module || "other";
        if (!acc[m]) acc[m] = [];
        acc[m].push(p);
        return acc;
      }, {}),
    [actionPermissions]
  );

  const pageCount = permissions.filter((p) => isPagePermission(p.name)).length;

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

  return (
    <>
      <div className="mb-6">
        <PageBreadCrumb pageTitle="Permissions" />
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Page access controls what appears in the sidebar. Assign pages to roles from the{" "}
          <a href="/roles" className="font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Roles
          </a>{" "}
          page. Action permissions (create, edit, delete) are listed separately below.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
          <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{pageCount}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Pages</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
          <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{actionPermissions.length}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Action permissions</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
          <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{pageGroups.length}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Sidebar sections</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Pages (sidebar access)</h2>
            <div className="space-y-4">
              {pageGroups.map((group) => (
                <div
                  key={group.section}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"
                >
                  <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{group.title}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {group.pages.length} page{group.pages.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="grid gap-px bg-gray-100 dark:bg-gray-800 sm:grid-cols-2 lg:grid-cols-3">
                    {group.pages.map(({ def, perm }) => (
                      <div key={perm.id} className="bg-white px-5 py-4 dark:bg-white/3">
                        <p className="text-sm font-medium text-gray-800 dark:text-white/90">{def.label}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-gray-500">{perm.name}</p>
                        {def.menuGroup ? (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{def.menuGroup}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
              Actions & capabilities
            </h2>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
              These control create, edit, delete, and other operations — not sidebar visibility.
            </p>
            <div className="space-y-4">
              {Object.entries(actionByModule).map(([module, perms]) => (
                <div
                  key={module}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"
                >
                  <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-800">
                    <h3 className="text-sm font-semibold capitalize text-gray-800 dark:text-white/90">
                      {formatActionModuleTitle(module)}
                    </h3>
                  </div>
                  <div className="grid gap-px bg-gray-100 dark:bg-gray-800 sm:grid-cols-2">
                    {perms.map((p) => (
                      <div key={p.id} className="flex items-start gap-3 bg-white px-5 py-3 dark:bg-white/3">
                        <Badge color="light" size="sm" variant="solid">
                          {p.name.split(".").pop()}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs text-gray-700 dark:text-gray-300">{p.name}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{p.description || "No description"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
