"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string };

type ReportRow = {
  id: number;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  totalAmount: number;
  completionChecklistLab: string | null;
  completionChecklistPrescription: string | null;
  completionChecklistClinicNote: string | null;
  clinicFormCount: number;
  branch: { id: number; name: string };
  doctor: { id: number; name: string };
  patient: { id: number; name: string; patientCode: string };
};

export default function AppointmentStatusReportPage() {
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId, seesAllBranches, hasMultipleAssignedBranches } = useBranchScope();
  const canView = hasPermission("appointments.view");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [branchId, setBranchId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);

  useEffect(() => {
    if (!canView) return;
    authFetch(hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, [canView, hasPermission]);

  useEffect(() => {
    if (!canView) return;
    authFetch("/api/doctors")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setDoctors(list as Doctor[]);
      })
      .catch(() => {});
  }, [canView]);

  useEffect(() => {
    if (singleAssignedBranchId && !branchId) setBranchId(String(singleAssignedBranchId));
    else if (seesAllBranches && !branchId) setBranchId("");
    else if (!seesAllBranches && branches.length === 1 && !branchId) setBranchId(String(branches[0].id));
  }, [singleAssignedBranchId, seesAllBranches, branches, branchId]);

  const run = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (branchId) params.set("branchId", branchId);
      if (doctorId) params.set("doctorId", doctorId);
      const res = await authFetch(`/api/reports/appointment-status?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setError("Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, branchId, doctorId, canView]);

  useEffect(() => {
    if (!canView) return;
    void run();
  }, [canView, run]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Appointment status report" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  const showBranchFilter = seesAllBranches || hasMultipleAssignedBranches;

  function triLabel(v: string | null) {
    if (v === "yes") return "Yes";
    if (v === "no") return "No";
    if (v === "na") return "N/A";
    return "—";
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Appointment status report" />
      <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Track calendar bookings by status, completion checklist, and linked clinic forms. Filter by date range, branch,
        and doctor.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <div>
          <DateField id="appt-status-from" label="From" value={from} onChange={setFrom} appendToBody />
        </div>
        <div>
          <DateField id="appt-status-to" label="To" value={to} onChange={setTo} appendToBody />
        </div>
        {showBranchFilter ? (
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All allowed branches</option>
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <Label>Doctor</Label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="h-11 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900/50">
              <TableCell isHeader>Date</TableCell>
              <TableCell isHeader>Time</TableCell>
              <TableCell isHeader>Client</TableCell>
              <TableCell isHeader>Doctor</TableCell>
              <TableCell isHeader>Branch</TableCell>
              <TableCell isHeader>Status</TableCell>
              <TableCell isHeader>Lab</TableCell>
              <TableCell isHeader>Rx</TableCell>
              <TableCell isHeader>Note</TableCell>
              <TableCell isHeader>Forms</TableCell>
              <TableCell isHeader className="text-right">
                Total
              </TableCell>
              <TableCell isHeader>Action</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-sm text-gray-500">
                  No rows for these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">{r.appointmentDate}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.startTime}
                    {r.endTime ? `–${r.endTime}` : ""}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.patient.name}
                    <span className="ml-1 font-mono text-xs text-gray-500">{r.patient.patientCode}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.doctor.name}</TableCell>
                  <TableCell className="text-sm">{r.branch.name}</TableCell>
                  <TableCell className="text-sm capitalize">{r.status.replace(/-/g, " ")}</TableCell>
                  <TableCell className="text-sm">{triLabel(r.completionChecklistLab)}</TableCell>
                  <TableCell className="text-sm">{triLabel(r.completionChecklistPrescription)}</TableCell>
                  <TableCell className="text-sm">{triLabel(r.completionChecklistClinicNote)}</TableCell>
                  <TableCell className="text-sm">{r.clinicFormCount}</TableCell>
                  <TableCell className="text-right text-sm">{r.totalAmount.toFixed(2)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <Link href={`/appointments/${r.id}`} className="text-brand-600 hover:underline dark:text-brand-400">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
