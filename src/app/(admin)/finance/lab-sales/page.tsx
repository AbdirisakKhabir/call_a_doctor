"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateRangeFilter from "@/components/form/DateRangeFilter";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string };

type LabSaleRow = {
  id: number;
  totalAmount: number;
  labFeePaidAmount: number;
  labFeeDiscountAmount: number;
  feeOutstanding: number;
  status: string;
  notes: string | null;
  createdAt: string;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  orderedBy: { id: number; name: string } | null;
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branchId: number;
    branch: { id: number; name: string };
  };
  items: { id: number; unitPrice: number; labTest: { id: number; name: string } }[];
};

export default function FinanceLabSalesPage() {
  const { hasPermission } = useAuth();
  const canView =
    hasPermission("financial.view") || hasPermission("accounts.reports") || hasPermission("lab.view");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rows, setRows] = useState<LabSaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/branches")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Branch[]) => {
        if (!cancelled) setBranches(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q =
      branchId.trim() && Number.isInteger(Number(branchId)) && Number(branchId) > 0
        ? `?branchId=${encodeURIComponent(branchId)}`
        : "";
    authFetch(`/api/doctors${q}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Doctor[]) => {
        if (!cancelled) setDoctors(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    setPage(1);
  }, [from, to, branchId, doctorId, status, searchDebounced]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    if (doctorId) params.set("doctorId", doctorId);
    if (status !== "all") params.set("status", status);
    if (searchDebounced.length >= 1) params.set("search", searchDebounced);

    const res = await authFetch(`/api/finance/lab-sales?${params}`);
    if (res.ok) {
      const body = await res.json();
      setRows(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    } else {
      setRows([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, from, to, branchId, doctorId, status, searchDebounced]);

  useEffect(() => {
    if (!canView) return;
    load();
  }, [canView, load]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab sales" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PageBreadCrumb pageTitle="Lab sales" />
        <Link
          href="/finance/lab-sales-report"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Lab sales report →
        </Link>
      </div>

      <div className="mb-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
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
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setDoctorId("");
              }}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Doctor</Label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <Label>Client search</Label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code or name"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Each row is a lab test request (sale) from a visit. Amounts match fees posted to the client account when
          the doctor sends the request.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-gray-500 dark:text-gray-400">No lab sales match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Tests</th>
                  <th className="px-4 py-3 text-right">Fee</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-white/5">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                      {new Date(r.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.appointment.branch.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{r.patient.name}</span>
                      <span className="ml-1 text-xs text-gray-500">({r.patient.patientCode})</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.doctor.name}</td>
                    <td className="max-w-[200px] px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {r.items.map((i) => i.labTest.name).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">${r.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      ${(r.labFeePaidAmount ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      ${(r.labFeeDiscountAmount ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">${r.feeOutstanding.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize dark:bg-gray-800">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="sales"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
