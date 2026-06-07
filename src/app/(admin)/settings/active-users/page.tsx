"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { UserActivityStatus } from "@/types/user-activity";

type Row = {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  roleName: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  status: UserActivityStatus;
};

type Payload = {
  users: Row[];
  summary: { total: number; online: number; activeLast24h: number; inactive: number };
};

function statusLabel(s: UserActivityStatus): string {
  switch (s) {
    case "online":
      return "Active now";
    case "recent":
      return "Session 24 h";
    case "signed_in_before":
      return "Signed in before";
    case "never":
      return "No sign-in yet";
    case "inactive":
      return "Disabled";
    default:
      return s;
  }
}

function statusPillClass(s: UserActivityStatus): string {
  switch (s) {
    case "online":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "recent":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
    case "signed_in_before":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "never":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    case "inactive":
      return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function ActiveUsersSettingsPage() {
  const { hasPermission } = useAuth();
  const canView =
    hasPermission("audit.view") || hasPermission("audit.view_admins");

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const res = await authFetch("/api/users/activity");
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error || "Failed to load");
        setData(null);
      } else {
        setData(await res.json());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Active users" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          You need <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">audit.view</code> or{" "}
          <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">audit.view_admins</code> to see who is using the system.
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Ask an administrator to update your role, or open{" "}
          <Link href="/settings" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Settings
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Active users" />

      {error && (
        <div className="mt-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700" />
        </div>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Active now</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{data.summary.online}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Session in 24 h</p>
              <p className="mt-1 text-2xl font-semibold text-sky-700 dark:text-sky-300">{data.summary.activeLast24h}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Disabled accounts</p>
              <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-gray-200">{data.summary.inactive}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total users</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{data.summary.total}</p>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                <TableRow>
                  <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                    User
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                    Role
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                    Status
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                    Last session check
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                    Last sign-in
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow key={u.id} className="border-b border-gray-50 dark:border-gray-800/80">
                    <TableCell className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900 dark:text-white">{u.name || u.email}</div>
                      {u.name ? <div className="text-xs text-gray-500">{u.email}</div> : null}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{u.roleName}</TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPillClass(u.status)}`}>
                        {statusLabel(u.status)}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDt(u.lastSeenAt)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDt(u.lastLoginAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            For a full audit of actions (not just presence), use{" "}
            <Link href="/settings/activity" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
              Activity log
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
