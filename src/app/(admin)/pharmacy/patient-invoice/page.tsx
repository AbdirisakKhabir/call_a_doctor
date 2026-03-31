"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { printConsolidatedInvoice } from "@/lib/patient-invoice-print";

type Branch = { id: number; name: string };

type Prescription = {
  id: number;
  isEmergency?: boolean;
  patient: { id: number; patientCode: string; name: string };
  doctor: { id: number; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
  };
  items: {
    id: number;
    quantity: number;
    product: { id: number; name: string; code: string; sellingPrice?: number };
  }[];
};

export default function PatientInvoicePage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [invPatientSearch, setInvPatientSearch] = useState("");
  const [invPatientResults, setInvPatientResults] = useState<{ id: number; patientCode: string; name: string }[]>([]);
  const [invPatient, setInvPatient] = useState<{ id: number; patientCode: string; name: string } | null>(null);
  const [invFrom, setInvFrom] = useState("");
  const [invTo, setInvTo] = useState("");
  /** Multiple Rx per patient: narrow list to emergency-only or clinic (scheduled) only. */
  const [invRxFilter, setInvRxFilter] = useState<"all" | "emergency" | "clinic">("all");
  const [invPrescriptions, setInvPrescriptions] = useState<Prescription[]>([]);
  const [invSelected, setInvSelected] = useState<Set<number>>(new Set());
  const [invLoading, setInvLoading] = useState(false);
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState("");

  const canView = hasPermission("pharmacy.view") && hasPermission("prescriptions.view");

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (res.ok) {
      const data: Branch[] = await res.json();
      setBranches(data);
      setBranchId((prev) => {
        if (prev && data.some((b) => String(b.id) === prev)) return prev;
        return data[0] ? String(data[0].id) : "";
      });
    }
  }

  useEffect(() => {
    if (!canView) return;
    void loadBranches();
  }, [canView]);

  const loadPatientPrescriptions = useCallback(async () => {
    if (!invPatient || !branchId) {
      setInvPrescriptions([]);
      setInvSelected(new Set());
      return;
    }
    setInvLoading(true);
    setInvError("");
    try {
      const params = new URLSearchParams({
        patientId: String(invPatient.id),
        branchId,
      });
      if (invFrom) params.set("from", invFrom);
      if (invTo) params.set("to", invTo);
      if (invRxFilter === "emergency") params.set("emergency", "yes");
      if (invRxFilter === "clinic") params.set("emergency", "no");
      const res = await authFetch(`/api/prescriptions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setInvError(data.error || "Failed to load prescriptions");
        setInvPrescriptions([]);
        return;
      }
      const list = Array.isArray(data) ? data : [];
      setInvPrescriptions(list as Prescription[]);
      setInvSelected(new Set());
    } finally {
      setInvLoading(false);
    }
  }, [invPatient, invFrom, invTo, branchId, invRxFilter]);

  useEffect(() => {
    if (!invPatient || !branchId) return;
    loadPatientPrescriptions();
  }, [invPatient, invFrom, invTo, branchId, invRxFilter, loadPatientPrescriptions]);

  useEffect(() => {
    if (!invPatientSearch.trim()) {
      setInvPatientResults([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/patients/search?q=${encodeURIComponent(invPatientSearch)}&limit=12`)
        .then((r) => r.ok && r.json())
        .then((data) => setInvPatientResults(Array.isArray(data) ? data : []))
        .catch(() => setInvPatientResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [invPatientSearch]);

  function toggleInvRx(id: number) {
    setInvSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInv() {
    setInvSelected(new Set(invPrescriptions.map((p) => p.id)));
  }

  const branchName = branches.find((b) => String(b.id) === branchId)?.name ?? "";

  async function handleGenerateInvoice() {
    if (!invPatient || invSelected.size === 0 || !branchId) {
      setInvError("Select pharmacy, patient, and at least one prescription.");
      return;
    }
    setInvSubmitting(true);
    setInvError("");
    try {
      const res = await authFetch("/api/prescriptions/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescriptionIds: Array.from(invSelected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvError(data.error || "Failed to build invoice");
        return;
      }
      let dateRangeLabel = "";
      if (invFrom && invTo) dateRangeLabel = `Visit dates: ${invFrom} – ${invTo}`;
      else if (invFrom) dateRangeLabel = `Visit dates: from ${invFrom}`;
      else if (invTo) dateRangeLabel = `Visit dates: until ${invTo}`;

      printConsolidatedInvoice({
        ...data,
        pharmacyLabel: branchName ? `Pharmacy / branch: ${branchName}` : undefined,
        dateRangeLabel: dateRangeLabel || undefined,
      });
    } finally {
      setInvSubmitting(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Patient invoice" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You need Pharmacy and Prescriptions access to use patient invoices.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Patient invoice" />
        <Link
          href="/prescriptions"
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Prescriptions
        </Link>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Build a one-time consolidated medication invoice for a patient. Choose the <strong>pharmacy branch</strong> (visit
        location), optional <strong>visit date range</strong>, and filter <strong>emergency</strong> vs <strong>clinic</strong>{" "}
        prescriptions when there are many. Then select which prescriptions to include. Line totals use each product&apos;s
        current selling price.
      </p>

      {invError && (
        <div className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {invError}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3 sm:p-8">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Label>Pharmacy (branch)</Label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setInvPrescriptions([]);
                  setInvSelected(new Set());
                }}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                aria-label="Pharmacy branch for invoice"
              >
                {branches.length === 0 ? (
                  <option value="">Loading branches…</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
              {seesAllBranches ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Only prescriptions tied to visits at this branch are listed.</p>
              ) : null}
            </div>
            <div>
              <Label>From (visit date)</Label>
              <div className="mt-1">
                <DateField value={invFrom} onChange={setInvFrom} />
              </div>
            </div>
            <div>
              <Label>To (visit date)</Label>
              <div className="mt-1">
                <DateField value={invTo} onChange={setInvTo} />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Date filters use the appointment (visit) date. Leave both empty to include all prescriptions for this patient
            at the selected branch.
          </p>

          {!invPatient ? (
            <div>
              <Label>Find patient</Label>
              <input
                value={invPatientSearch}
                onChange={(e) => setInvPatientSearch(e.target.value)}
                placeholder="Name or patient code…"
                disabled={!branchId}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              {!branchId && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Select a pharmacy branch first.</p>}
              {invPatientResults.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  {invPatientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => {
                          setInvPatient(p);
                          setInvPatientSearch("");
                          setInvPatientResults([]);
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-gray-500">{p.patientCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-800 dark:bg-brand-500/10">
                <span className="font-medium text-gray-900 dark:text-white">
                  {invPatient.name} <span className="text-gray-500">({invPatient.patientCode})</span>
                </span>
                <button
                  type="button"
                  className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                  onClick={() => {
                    setInvPatient(null);
                    setInvPrescriptions([]);
                    setInvSelected(new Set());
                  }}
                >
                  Change patient
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <Label className="text-xs">Prescription type</Label>
                  <select
                    value={invRxFilter}
                    onChange={(e) => {
                      setInvRxFilter(e.target.value as "all" | "emergency" | "clinic");
                      setInvSelected(new Set());
                    }}
                    className="mt-1 h-10 min-w-[12rem] rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    aria-label="Filter prescriptions by emergency or clinic visit"
                  >
                    <option value="all">All prescriptions</option>
                    <option value="emergency">Emergency only</option>
                    <option value="clinic">Clinic (scheduled visit) only</option>
                  </select>
                </div>
                <p className="mt-6 max-w-md text-xs text-gray-500 dark:text-gray-400">
                  Use this when a patient has several emergency and regular prescriptions—show only the kind you are billing.
                </p>
              </div>

              {invLoading ? (
                <p className="text-sm text-gray-500">Loading prescriptions…</p>
              ) : invPrescriptions.length === 0 ? (
                <p className="text-sm text-gray-500">No prescriptions for this patient at this branch in the selected date range.</p>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={selectAllInv}
                      className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                        <tr>
                          <th className="w-10 px-3 py-2" />
                          <th className="px-3 py-2">Visit date</th>
                          <th className="px-3 py-2">Branch</th>
                          <th className="px-3 py-2">Doctor</th>
                          <th className="px-3 py-2">Items</th>
                          <th className="px-3 py-2 text-right">Est. total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invPrescriptions.map((rx) => {
                          const est = rx.items.reduce(
                            (s, it) =>
                              s +
                              (it.quantity || 0) *
                                (typeof it.product.sellingPrice === "number" ? it.product.sellingPrice : 0),
                            0
                          );
                          const d = rx.appointment.appointmentDate;
                          const dateLabel =
                            typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
                          return (
                            <tr key={rx.id} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={invSelected.has(rx.id)}
                                  onChange={() => toggleInvRx(rx.id)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {rx.isEmergency ? (
                                  <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                                    Emergency
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                    Clinic
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">{dateLabel}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {rx.appointment.branch?.name ?? "—"}
                              </td>
                              <td className="px-3 py-2">{rx.doctor.name}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                                {rx.items.length} line{rx.items.length !== 1 ? "s" : ""}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">${est.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-6 dark:border-gray-700">
          <Button
            size="sm"
            disabled={!invPatient || invSelected.size === 0 || invSubmitting || !branchId}
            onClick={handleGenerateInvoice}
          >
            {invSubmitting ? "Building…" : "Print invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
