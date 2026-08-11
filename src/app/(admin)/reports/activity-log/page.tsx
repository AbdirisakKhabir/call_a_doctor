"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import InputField from "@/components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { downloadExcelWorkbook } from "@/lib/excel-export";

type AuditRow = {
  id: number;
  userId: number;
  action: string;
  module: string | null;
  resourceType: string | null;
  resourceId: number | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: number;
    name: string | null;
    email: string;
    role?: { name: string } | null;
  };
};

type UserOption = {
  id: number;
  name: string | null;
  email: string;
  role?: { name: string } | null;
};

function formatMeta(meta: unknown): string {
  if (meta == null) return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return "";
  }
}

export default function ActivityLogReportPage() {
  const { hasPermission } = useAuth();
  const canViewFull = hasPermission("audit.view");
  const canViewAdminOnly = hasPermission("audit.view_admins");
  const canAccess = canViewFull || canViewAdminOnly;
  const canListUsers = hasPermission("users.view");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionQ, setActionQ] = useState("");
  const [moduleQ, setModuleQ] = useState("");
  const [userSelect, setUserSelect] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [adminOnlyScope, setAdminOnlyScope] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("paginate", "true");
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (actionQ.trim()) params.set("action", actionQ.trim());
    if (moduleQ.trim()) params.set("module", moduleQ.trim());
    if (canListUsers && userSelect) params.set("userId", userSelect);
    return params;
  }, [page, from, to, actionQ, moduleQ, userSelect, canListUsers]);

  const loadUsers = useCallback(async () => {
    if (!canListUsers) return;
    const res = await authFetch("/api/users?page=1&pageSize=500");
    if (res.ok) {
      const body = await res.json();
      setUsers((body.data ?? []) as UserOption[]);
    }
  }, [canListUsers]);

  const loadReport = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/reports/activity-log?${filterParams()}`);
      if (res.ok) {
        const body = await res.json();
        setRows(body.data ?? []);
        setTotal(typeof body.total === "number" ? body.total : 0);
        setUniqueUsers(body.summary?.uniqueUsers ?? 0);
        setAdminOnlyScope(Boolean(body.summary?.restrictedToAdminActors));
      } else {
        setRows([]);
        setTotal(0);
        setUniqueUsers(0);
      }
    } finally {
      setLoading(false);
    }
  }, [canAccess, filterParams]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [from, to, actionQ, moduleQ, userSelect]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const userOptions = useMemo(
    () => (adminOnlyScope ? users.filter((u) => u.role?.name === "Admin") : users),
    [users, adminOnlyScope]
  );

  async function exportExcel() {
    setExporting(true);
    try {
      const params = filterParams();
      params.delete("paginate");
      params.delete("page");
      params.delete("pageSize");
      params.set("export", "1");
      const res = await authFetch(`/api/reports/activity-log?${params}`);
      if (!res.ok) {
        alert("Export failed");
        return;
      }
      const body = await res.json();
      const data = (body.data ?? []) as AuditRow[];
      if (data.length === 0) {
        alert("No rows to export for the current filters.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadExcelWorkbook(`activity-log-report-${stamp}.xlsx`, [
        {
          name: "Activity log",
          rows: data.map((r) => ({
            Time: new Date(r.createdAt).toLocaleString(),
            User: r.user.name ?? "",
            Email: r.user.email,
            Role: r.user.role?.name ?? "",
            Action: r.action,
            Module: r.module ?? "",
            Resource: r.resourceType
              ? `${r.resourceType}${r.resourceId != null ? ` #${r.resourceId}` : ""}`
              : "",
            Details: formatMeta(r.metadata),
            IP: r.ipAddress ?? "",
          })),
        },
      ]);
    } finally {
      setExporting(false);
    }
  }

  if (!canAccess) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Activity log report" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          You need <code className="text-xs">audit.view</code> or{" "}
          <code className="text-xs">audit.view_admins</code> to open this report.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Activity log report" />
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="sm" disabled={exporting || loading} onClick={() => void exportExcel()}>
            {exporting ? "Exporting…" : "Export Excel"}
          </Button>
          <Link href="/settings/activity" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Live activity log →
          </Link>
        </div>
      </div>

      <p className="max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Detailed audit of user transactions across the system — sign-ins, payments, pharmacy sales, client
        updates, calendar changes, and other recorded actions. Filter by date, user, module, or action type.
        {adminOnlyScope ? " Your access is limited to Administrator accounts." : null}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Matching entries</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Users in report</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{uniqueUsers}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Scope</p>
          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
            {adminOnlyScope ? "Admin users only" : "All users"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => {
            setFrom("");
            setTo("");
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canListUsers ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">User</label>
              <select
                value={userSelect}
                onChange={(e) => setUserSelect(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">All users</option>
                {userOptions.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name || u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Module</label>
            <InputField
              type="text"
              placeholder="e.g. payments, pharmacy"
              value={moduleQ}
              onChange={(e) => setModuleQ(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Action contains</label>
            <InputField
              type="text"
              placeholder="e.g. patient_payment"
              value={actionQ}
              onChange={(e) => setActionQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Time</TableCell>
                <TableCell isHeader>User</TableCell>
                <TableCell isHeader>Role</TableCell>
                <TableCell isHeader>Action</TableCell>
                <TableCell isHeader>Module</TableCell>
                <TableCell isHeader>Resource</TableCell>
                <TableCell isHeader>Details</TableCell>
                <TableCell isHeader>IP</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-gray-500">
                    No activity matches your filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{r.user.name || "—"}</div>
                      <div className="text-xs text-gray-500">{r.user.email}</div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {r.user.role?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell className="text-sm">{r.module ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.resourceType
                        ? `${r.resourceType}${r.resourceId != null ? ` #${r.resourceId}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[220px] font-mono text-xs text-gray-600 dark:text-gray-400">
                      <span className="block truncate" title={formatMeta(r.metadata)}>
                        {formatMeta(r.metadata) || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{r.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="entries"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
