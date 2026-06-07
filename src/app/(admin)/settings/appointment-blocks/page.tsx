"use client";

import React, { useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PlusIcon, TrashBinIcon } from "@/icons";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import TimeField from "@/components/form/TimeField";
import { formatTime12hLabel } from "@/lib/appointment-calendar-time";

type Branch = { id: number; name: string };

type BlockWindow = { id: number; startTime: string; endTime: string; sortOrder: number };

type BlockRow = {
  id: number;
  branchId: number | null;
  branch: { id: number; name: string } | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  windows: BlockWindow[];
  label: string | null;
  isActive: boolean;
};

type TimeWindowForm = { startTime: string; endTime: string };

function defaultTimeWindows(): TimeWindowForm[] {
  return [
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "13:00", endTime: "15:00" },
    { startTime: "18:00", endTime: "21:30" },
  ];
}

export default function AppointmentBlocksSettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BlockRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    label: "",
    branchId: "" as string,
    startDate: "",
    endDate: "",
    allDay: true,
    windows: defaultTimeWindows(),
    isActive: true,
  });

  async function load() {
    const res = await authFetch("/api/settings/appointment-blocks");
    if (res.ok) {
      const data = (await res.json()) as { blocks: BlockRow[] };
      setRows(data.blocks);
    }
  }

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const brRes = await authFetch("/api/branches?all=true");
      if (!cancelled && brRes.ok) {
        const list = (await brRes.json()) as Branch[];
        setBranches(Array.isArray(list) ? list.filter((b) => b && typeof b.id === "number") : []);
      }
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  function openAdd() {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    setForm({
      label: "",
      branchId: "",
      startDate: today,
      endDate: today,
      allDay: true,
      windows: defaultTimeWindows(),
      isActive: true,
    });
    setError("");
    setModalOpen(true);
  }

  function openEdit(r: BlockRow) {
    setEditing(r);
    setForm({
      label: r.label ?? "",
      branchId: r.branchId != null ? String(r.branchId) : "",
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      allDay: r.allDay,
      windows:
        !r.allDay && r.windows?.length
          ? r.windows.map((w) => ({
              startTime: w.startTime.length >= 5 ? w.startTime.slice(0, 5) : w.startTime,
              endTime: w.endTime.length >= 5 ? w.endTime.slice(0, 5) : w.endTime,
            }))
          : defaultTimeWindows(),
      isActive: r.isActive,
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        label: form.label.trim() || null,
        branchId: form.branchId === "" ? null : Number(form.branchId),
        startDate: form.startDate,
        endDate: form.endDate,
        allDay: form.allDay,
        isActive: form.isActive,
      };
      if (!form.allDay) {
        payload.windows = form.windows.map((w) => ({
          startTime: w.startTime.slice(0, 5),
          endTime: w.endTime.slice(0, 5),
        }));
      }
      if (editing) {
        const res = await authFetch(`/api/settings/appointment-blocks/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError((data as { error?: string }).error || "Failed to save");
          return;
        }
      } else {
        const res = await authFetch("/api/settings/appointment-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError((data as { error?: string }).error || "Failed to add");
          return;
        }
      }
      setModalOpen(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!canManage || !confirm("Delete this holiday / blocked time?")) return;
    const res = await authFetch(`/api/settings/appointment-blocks/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function toggleActive(r: BlockRow) {
    const res = await authFetch(`/api/settings/appointment-blocks/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    if (res.ok) await load();
  }

  if (!canManage) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Holidays & blocked times" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">You need settings management access to edit calendar closures.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Holidays & blocked times" />
        <Button type="button" size="sm" onClick={openAdd} className="shrink-0">
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Add closure
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Label
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Location
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Dates
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Hours
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Active
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-xs font-semibold uppercase text-gray-500">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No closures yet. Add a holiday or blocked hours.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className="border-b border-gray-50 dark:border-gray-800/80">
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {r.label || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {r.branch ? r.branch.name : "All branches"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {r.allDay
                        ? "All day"
                        : r.windows?.length
                          ? r.windows
                              .map(
                                (w) =>
                                  `${formatTime12hLabel(w.startTime.slice(0, 5))}–${formatTime12hLabel(w.endTime.slice(0, 5))}`
                              )
                              .join(", ")
                          : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(r)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          r.isActive
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                            : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {r.isActive ? "On" : "Off"}
                      </button>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-error-50 hover:text-error-600 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-error-500/10"
                          title="Delete"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900"
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editing ? "Edit closure" : "Add closure"}
            </h2>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {error && (
                <div className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}
              <div>
                <Label>Label (optional)</Label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                  placeholder="e.g. Eid Days, Staff meeting"
                />
              </div>
              <div>
                <Label>Branch</Label>
                <select
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateField
                  label="Start date *"
                  value={form.startDate}
                  onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
                  required
                  appendToBody
                  placeholder="Select start date"
                />
                <DateField
                  label="End date *"
                  value={form.endDate}
                  onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                  required
                  min={form.startDate || undefined}
                  appendToBody
                  placeholder="Select end date"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="allDay"
                  type="checkbox"
                  checked={form.allDay}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      allDay: v,
                      windows:
                        !v && f.windows.length === 0 ? defaultTimeWindows() : f.windows,
                    }));
                  }}
                  className="rounded border-gray-300"
                />
                <label htmlFor="allDay" className="text-sm text-gray-700 dark:text-gray-300">
                  All day (holiday / full closure)
                </label>
              </div>
              {!form.allDay && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Blocked hours (same times each day in the range)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          windows: [...f.windows, { startTime: "09:00", endTime: "10:00" }],
                        }))
                      }
                    >
                      Add range
                    </Button>
                  </div>
                  {form.windows.map((w, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <TimeField
                        label="From *"
                        value={w.startTime}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            windows: f.windows.map((x, j) =>
                              j === i ? { ...x, startTime: v || x.startTime } : x
                            ),
                          }))
                        }
                        required={!form.allDay}
                        appendToBody
                        placeholder="Start time"
                      />
                      <TimeField
                        label="To *"
                        value={w.endTime}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            windows: f.windows.map((x, j) =>
                              j === i ? { ...x, endTime: v || x.endTime } : x
                            ),
                          }))
                        }
                        required={!form.allDay}
                        appendToBody
                        placeholder="End time"
                      />
                      <div className="flex items-end pb-0.5">
                        {form.windows.length > 1 ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-error-600 hover:underline dark:text-error-400"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                windows: f.windows.filter((_, j) => j !== i),
                              }))
                            }
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500"> </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
                  Rule is active
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
