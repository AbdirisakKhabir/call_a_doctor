"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import DateField from "@/components/form/DateField";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatTime12hLabel } from "@/lib/appointment-calendar-time";
import { Search } from "lucide-react";

type Row = {
  id: number;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  branch: { id: number; name: string };
  services: { service: { name: string }; quantity: number }[];
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function defaultFromIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function servicesSummary(apt: Row): string {
  if (!apt.services?.length) return "—";
  return apt.services.map((s) => s.service.name).join(", ");
}

export default function CancelledAppointmentsPage() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canView = hasPermission("appointments.view");

  const [from, setFrom] = useState(() => {
    const f = searchParams.get("from");
    return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : defaultFromIso();
  });
  const [to, setTo] = useState(() => {
    const t = searchParams.get("to");
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
  });
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    const n = p ? Number(p) : 1;
    return Number.isInteger(n) && n >= 1 ? n : 1;
  });
  const [pageSize, setPageSize] = useState<number>(20);

  const qInit = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const [searchInput, setSearchInput] = useState(qInit);
  const [searchQuery, setSearchQuery] = useState(qInit);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startDate: from,
        endDate: to,
        status: "cancelled",
        page: String(page),
        pageSize: String(pageSize),
      });
      if (searchQuery) params.set("search", searchQuery);
      const res = await authFetch(`/api/appointments?${params.toString()}`);
      const data = (await res.json()) as {
        error?: string;
        data?: Row[];
        total?: number;
        page?: number;
        pageSize?: number;
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(Array.isArray(data.data) ? data.data : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch {
      setError("Failed to load");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [canView, from, to, page, pageSize, searchQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput.trim().slice(0, 120));
    }, 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const prevSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSearchRef.current === null) {
      prevSearchRef.current = searchQuery;
      return;
    }
    if (prevSearchRef.current !== searchQuery) {
      prevSearchRef.current = searchQuery;
      setPage(1);
    }
  }, [searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const tp = Math.max(1, Math.ceil(total / pageSize));
    if (total > 0 && page > tp) {
      setPage(tp);
    }
    if (total === 0 && page > 1) {
      setPage(1);
    }
  }, [loading, total, page, pageSize]);

  function onChangeFrom(iso: string) {
    setFrom(iso);
    setPage(1);
  }

  function onChangeTo(iso: string) {
    setTo(iso);
    setPage(1);
  }

  function onChangePageSize(next: number) {
    setPageSize(next);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const fromIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const toIdx = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Cancelled bookings" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to view the calendar.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 rounded-2xl border border-gray-200/90 bg-gradient-to-b from-gray-100 to-gray-50/90 p-4 sm:p-6 dark:border-gray-800 dark:from-gray-950 dark:to-gray-900/90">
      <div className="mb-0 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageBreadCrumb pageTitle="Cancelled bookings" />
        <Link
          href="/appointments"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to calendar
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-none dark:ring-white/10">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Cancelled visits do not block the calendar grid. Use this list to audit cancellations, open a record, or
          confirm that a time slot is free for a new booking.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10">
        <div>
          <Label htmlFor="cancelled-from">From</Label>
          <DateField
            id="cancelled-from"
            value={from}
            onChange={onChangeFrom}
            className="mt-1"
            appendToBody
          />
        </div>
        <div>
          <Label htmlFor="cancelled-to">To</Label>
          <DateField
            id="cancelled-to"
            value={to}
            onChange={onChangeTo}
            className="mt-1"
            appendToBody
          />
        </div>
        <div>
          <Label htmlFor="cancelled-page-size">Rows per page</Label>
          <select
            id="cancelled-page-size"
            value={pageSize}
            disabled={loading}
            onChange={(e) => onChangePageSize(Number(e.target.value))}
            className="mt-1 h-10 w-full min-w-[7rem] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[min(100%,18rem)] flex-1 sm:min-w-[14rem] sm:max-w-md">
          <Label htmlFor="cancelled-search">Search</Label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              aria-hidden
            />
            <Input
              id="cancelled-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Client name, code, doctor, branch, booking #, service…"
              autoComplete="off"
              className="pl-10"
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Filters within the date range above. Results update as you type.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
      ) : loading ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">No cancelled bookings in this date range.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md ring-1 ring-black/[0.04] dark:border-gray-700 dark:bg-gray-950 dark:shadow-lg dark:shadow-black/20 dark:ring-white/[0.08]">
          <Table className="divide-gray-200 dark:divide-gray-800">
            <TableHeader className="!bg-slate-100 dark:!bg-gray-800/95">
              <TableRow>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Date
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Time
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Client
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Doctor
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Branch
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Services
                </TableCell>
                <TableCell
                  isHeader
                  className="text-xs font-semibold text-slate-700 dark:text-gray-200"
                >
                  Open
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white dark:bg-gray-950">
              {rows.map((a) => (
                <TableRow
                  key={a.id}
                  className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-gray-950 dark:even:bg-gray-900/60 hover:bg-amber-50/40 dark:hover:bg-white/[0.06]"
                >
                  <TableCell className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {a.appointmentDate.slice(0, 10)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm tabular-nums text-gray-800 dark:text-gray-200">
                    {formatTime12hLabel(a.startTime)}
                    {a.endTime ? ` – ${formatTime12hLabel(a.endTime)}` : ""}
                  </TableCell>
                  <TableCell className="max-w-[200px] text-sm text-gray-800 dark:text-gray-200">{a.patient.name}</TableCell>
                  <TableCell className="text-sm text-gray-700 dark:text-gray-300">Dr. {a.doctor.name}</TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">{a.branch.name}</TableCell>
                  <TableCell className="max-w-[240px] text-xs text-gray-600 dark:text-gray-400">
                    {servicesSummary(a)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link
                      href={`/appointments/${a.id}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !error && total > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Showing <span className="tabular-nums">{fromIdx}</span>–<span className="tabular-nums">{toIdx}</span> of{" "}
            <span className="tabular-nums">{total}</span> for {from} through {to}
            {searchQuery ? (
              <>
                {" "}
                · matching <span className="font-medium text-gray-800 dark:text-gray-200">&quot;{searchQuery}&quot;</span>
              </>
            ) : null}
            .
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
              Page {safePage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : !loading && !error && total === 0 ? (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          No results for {from} through {to}.
        </p>
      ) : null}
    </div>
  );
}
