"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type TrashRow = {
  id: number;
  entityType: string;
  recordId: number;
  title: string;
  detail: string | null;
  deletedAt: string;
  purgeAt: string;
  daysRemaining: number;
  restorable: boolean;
  deletedBy: { id: number; name: string | null; email: string } | null;
};

export default function TrashPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("settings.manage");
  const [items, setItems] = useState<TrashRow[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/trash");
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed to load");
        setItems([]);
        return;
      }
      setItems(j.items ?? []);
      if (typeof j.retentionDays === "number") setRetentionDays(j.retentionDays);
    } catch {
      setError("Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: number) {
    if (!confirm("Restore this record? It will be inserted again with a new id if successful.")) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/trash/${id}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || "Restore failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function permanentRemove(id: number) {
    if (!confirm("Remove this trash entry now? The snapshot cannot be recovered from the bin.")) return;
    setBusyId(id);
    try {
      const res = await authFetch(`/api/trash/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error || "Failed");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Recycle bin" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Recycle bin" />
      <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
        Deleted records are listed here for <strong>{retentionDays} days</strong>, then removed automatically (along with
        their snapshot). Restore is available for common setup records where the server can safely recreate the row;
        complex deletes (e.g. calendar bookings, lab tests) are kept for reference only.
      </p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Automatic cleanup also runs when you open this page. For production schedulers, POST{" "}
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">/api/cron/trash-purge</code> with{" "}
        <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">CRON_TRASH_SECRET</code>.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-10 flex justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-10 text-sm text-gray-500 dark:text-gray-400">The recycle bin is empty.</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Type</th>
                <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Title</th>
                <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Deleted</th>
                <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">Purges in</th>
                <th className="px-4 py-3 font-semibold text-gray-900 dark:text-white">By</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((row) => (
                <tr key={row.id} className="bg-white dark:bg-gray-900/20">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{row.entityType}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    <span className="font-medium">{row.title}</span>
                    {row.detail ? (
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{row.detail}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                    {new Date(row.deletedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                    {row.daysRemaining} day{row.daysRemaining === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {row.deletedBy?.name || row.deletedBy?.email || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.restorable ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void restore(row.id)}
                        className="mr-2 rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-400 dark:text-brand-400 dark:hover:bg-brand-500/10"
                      >
                        Restore
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void permanentRemove(row.id)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
