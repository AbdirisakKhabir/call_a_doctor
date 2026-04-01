"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import InputField from "@/components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type AuditRow = {
  id: number;
  userId: number;
  action: string;
  module: string | null;
  resourceType: string | null;
  resourceId: number | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: number; name: string | null; email: string };
};

type UserOption = { id: number; name: string | null; email: string };

function formatMeta(meta: unknown): string {
  if (meta == null) return "—";
  try {
    const s = JSON.stringify(meta);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

export default function ActivityLogPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("audit.view");
  const canListUsers = hasPermission("users.view");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionQ, setActionQ] = useState("");
  const [moduleQ, setModuleQ] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [userSelect, setUserSelect] = useState<string>("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    if (!canListUsers) return;
    const res = await authFetch("/api/users?page=1&pageSize=500");
    if (res.ok) {
      const body = await res.json();
      const data = (body.data ?? []) as UserOption[];
      setUsers(data);
    }
  }, [canListUsers]);

  const loadLogs = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("paginate", "true");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (actionQ.trim()) params.set("action", actionQ.trim());
      if (moduleQ.trim()) params.set("module", moduleQ.trim());
      const uid =
        canListUsers && userSelect
          ? userSelect
          : userIdFilter.trim()
            ? userIdFilter.trim()
            : "";
      if (uid && /^\d+$/.test(uid)) params.set("userId", uid);

      const res = await authFetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const body = await res.json();
        setRows(body.data ?? []);
        setTotal(typeof body.total === "number" ? body.total : 0);
      } else {
        setRows([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [canView, page, from, to, actionQ, moduleQ, userIdFilter, userSelect, canListUsers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Activity log" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          You do not have permission to view the audit log (
          <code className="text-xs">audit.view</code>).
        </p>
        <Link href="/settings" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Activity log" />
      <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Sign-ins and recorded actions across pharmacy, patients, appointments, visit cards, payments, and other modules. Filter by date, user, module, or action.
      </p>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canListUsers ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">User</label>
              <select
                value={userSelect}
                onChange={(e) => {
                  setUserSelect(e.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name || u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">User ID (optional)</label>
              <InputField
                type="text"
                placeholder="e.g. 1"
                value={userIdFilter}
                onChange={(e) => {
                  setUserIdFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Module</label>
            <InputField
              type="text"
              placeholder="e.g. pharmacy, patients"
              value={moduleQ}
              onChange={(e) => {
                setModuleQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Action contains</label>
            <InputField
              type="text"
              placeholder="e.g. pharmacy.sale"
              value={actionQ}
              onChange={(e) => {
                setActionQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              loadLogs();
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Apply filters
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell isHeader>Time</TableCell>
                <TableCell isHeader>User</TableCell>
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
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-gray-500">
                    No entries match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {r.user.name || "—"}
                      </div>
                      <div className="text-xs text-gray-500">{r.user.email}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.action}</TableCell>
                    <TableCell className="text-sm">{r.module ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.resourceType ? `${r.resourceType}${r.resourceId != null ? ` #${r.resourceId}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] font-mono text-xs text-gray-600 dark:text-gray-400">
                      <span className="block truncate" title={formatMeta(r.metadata)}>
                        {formatMeta(r.metadata)}
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

      <Link href="/settings" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
        ← Back to settings overview
      </Link>
    </div>
  );
}
