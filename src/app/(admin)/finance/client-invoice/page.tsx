"use client";

import React, { useCallback, useEffect, useState } from "react";
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
type CandidatePermissions = { prescriptions: boolean; labs: boolean; appointments: boolean };

type RxRow = {
  id: number;
  isEmergency?: boolean;
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

type LabRow = {
  id: number;
  status: string;
  totalAmount: number;
  itemCount: number;
  doctor: { id: number; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
  };
};

type ApptRow = {
  id: number;
  appointmentDate: string;
  startTime: string;
  totalAmount: number;
  doctor: { id: number; name: string };
  branch: { id: number; name: string };
  serviceCount: number;
  servicesSummary: string | null;
  lineTotalFromServices: number;
};

type InvoiceSourceTab = "all" | "prescriptions" | "labs" | "appointments";

function dateKey(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function parseSelection(keys: Set<string>) {
  const prescriptionIds: number[] = [];
  const labOrderIds: number[] = [];
  const appointmentIds: number[] = [];
  for (const k of keys) {
    const [kind, idStr] = k.split(":");
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (kind === "rx") prescriptionIds.push(id);
    else if (kind === "lab") labOrderIds.push(id);
    else if (kind === "apt") appointmentIds.push(id);
  }
  return { prescriptionIds, labOrderIds, appointmentIds };
}

export default function PatientInvoicePage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches } = useBranchScope();

  const canPatients = hasPermission("patients.view");
  const canPrescriptions = hasPermission("pharmacy.view") && hasPermission("prescriptions.view");
  const canLabs = hasPermission("lab.view");
  const canAppointments = hasPermission("appointments.view");
  const canUseInvoice = canPatients && (canPrescriptions || canLabs || canAppointments);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<{ id: number; patientCode: string; name: string }[]>([]);
  const [patient, setPatient] = useState<{ id: number; patientCode: string; name: string } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rxEmergency, setRxEmergency] = useState<"all" | "emergency" | "clinic">("all");
  const [sourceTab, setSourceTab] = useState<InvoiceSourceTab>("all");
  const [permissions, setPermissions] = useState<CandidatePermissions | null>(null);
  const [rxRows, setRxRows] = useState<RxRow[]>([]);
  const [labRows, setLabRows] = useState<LabRow[]>([]);
  const [apptRows, setApptRows] = useState<ApptRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linkVisitFromRx, setLinkVisitFromRx] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tabCount = Number(canPrescriptions) + Number(canLabs) + Number(canAppointments);

  useEffect(() => {
    if (sourceTab === "prescriptions" && !canPrescriptions) setSourceTab("all");
    if (sourceTab === "labs" && !canLabs) setSourceTab("all");
    if (sourceTab === "appointments" && !canAppointments) setSourceTab("all");
  }, [sourceTab, canPrescriptions, canLabs, canAppointments]);

  async function loadBranches() {
    const url = hasPermission("settings.manage") ? "/api/branches?all=true" : "/api/branches";
    const res = await authFetch(url);
    if (!res.ok) return;
    const data: Branch[] = await res.json();
    setBranches(data);
    setBranchId((prev) => {
      if (prev && data.some((b) => String(b.id) === prev)) return prev;
      return data[0] ? String(data[0].id) : "";
    });
  }

  useEffect(() => {
    if (!canUseInvoice) return;
    void loadBranches();
  }, [canUseInvoice]);

  const loadCandidates = useCallback(async () => {
    if (!patient || !branchId) {
      setRxRows([]);
      setLabRows([]);
      setApptRows([]);
      setPermissions(null);
      setSelected(new Set());
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ patientId: String(patient.id), branchId });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (rxEmergency === "emergency") params.set("emergency", "yes");
      if (rxEmergency === "clinic") params.set("emergency", "no");
      const res = await authFetch(`/api/finance/client-invoice/candidates?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load billable items");
        setRxRows([]);
        setLabRows([]);
        setApptRows([]);
        setPermissions(null);
        return;
      }
      setPermissions(data.permissions ?? null);
      setRxRows(Array.isArray(data.prescriptions) ? data.prescriptions : []);
      setLabRows(Array.isArray(data.labOrders) ? data.labOrders : []);
      setApptRows(Array.isArray(data.appointments) ? data.appointments : []);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [patient, branchId, from, to, rxEmergency]);

  useEffect(() => {
    if (!patient || !branchId) return;
    void loadCandidates();
  }, [patient, branchId, from, to, rxEmergency, loadCandidates]);

  useEffect(() => {
    if (!patientSearch.trim()) {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/patients/search?q=${encodeURIComponent(patientSearch)}&limit=12`)
        .then((r) => r.ok && r.json())
        .then((data) => setPatientResults(Array.isArray(data) ? data : []))
        .catch(() => setPatientResults([]));
    }, 280);
    return () => clearTimeout(t);
  }, [patientSearch]);

  function toggleKey(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllInList(keys: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }

  const branchLabel = branches.find((biz) => String(biz.id) === branchId)?.name ?? "";

  async function handlePrint() {
    if (!patient || !branchId) {
      setError("Choose branch and client.");
      return;
    }
    const { prescriptionIds, labOrderIds, appointmentIds } = parseSelection(selected);
    const visitLinked = linkVisitFromRx && prescriptionIds.length > 0;
    if (prescriptionIds.length === 0 && labOrderIds.length === 0 && appointmentIds.length === 0 && !visitLinked) {
      setError("Select rows to bill, or add visit charges from selected prescriptions.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await authFetch("/api/finance/client-invoice/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          branchId: Number(branchId),
          prescriptionIds,
          labOrderIds,
          appointmentIds,
          includeVisitServiceFees: visitLinked,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not build invoice");
        return;
      }
      let dateRangeLabel = "";
      if (from && to) dateRangeLabel = `Visit dates: ${from} – ${to}`;
      else if (from) dateRangeLabel = `Visit dates: from ${from}`;
      else if (to) dateRangeLabel = `Visit dates: until ${to}`;
      await printConsolidatedInvoice({
        ...data,
        pharmacyLabel: branchLabel ? `Branch: ${branchLabel}` : undefined,
        dateRangeLabel: dateRangeLabel || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!canUseInvoice) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Client invoice" />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          You need access to clients and at least one of: pharmacy + prescriptions, lab, or appointments.
        </p>
      </div>
    );
  }

  const showRx = (sourceTab === "all" || sourceTab === "prescriptions") && (permissions?.prescriptions ?? canPrescriptions);
  const showLabs = (sourceTab === "all" || sourceTab === "labs") && (permissions?.labs ?? canLabs);
  const showAppts = (sourceTab === "all" || sourceTab === "appointments") && (permissions?.appointments ?? canAppointments);

  const sel = parseSelection(selected);
  const hasAnySelection =
    sel.prescriptionIds.length > 0 || sel.labOrderIds.length > 0 || sel.appointmentIds.length > 0;
  const visitFromRxOk = linkVisitFromRx && sel.prescriptionIds.length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Client invoice" />
        <div className="flex gap-4 text-sm">
          <Link href="/financial-reports" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Finance
          </Link>
          <Link href="/prescriptions" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Prescriptions
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950/30">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Branch</Label>
              <select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setPatient(null);
                  setSelected(new Set());
                }}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                {branches.map((biz) => (
                  <option key={biz.id} value={String(biz.id)}>
                    {biz.name}
                  </option>
                ))}
              </select>
              {seesAllBranches ? <p className="mt-0.5 text-[11px] text-gray-500">Visits filtered by branch.</p> : null}
            </div>
            <div>
              <Label>Visit from</Label>
              <div className="mt-1">
                <DateField value={from} onChange={setFrom} />
              </div>
            </div>
            <div>
              <Label>Visit to</Label>
              <div className="mt-1">
                <DateField value={to} onChange={setTo} />
              </div>
            </div>
            <div>
              <Label>Rx type</Label>
              <select
                value={rxEmergency}
                onChange={(e) => setRxEmergency(e.target.value as typeof rxEmergency)}
                className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                disabled={!canPrescriptions}
              >
                <option value="all">All</option>
                <option value="emergency">Emergency</option>
                <option value="clinic">Clinic</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          {!patient ? (
            <div>
              <Label>Client</Label>
              <input
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search name or code"
                disabled={!branchId}
                className="mt-1 h-10 w-full max-w-md rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
              {patientResults.length > 0 ? (
                <ul className="mt-2 max-h-40 max-w-md overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={() => {
                          setPatient(p);
                          setPatientSearch("");
                          setPatientResults([]);
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-gray-500">{p.patientCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{patient.name}</span>
                  <span className="text-gray-500"> · {patient.patientCode}</span>
                </div>
                <button
                  type="button"
                  className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                  onClick={() => {
                    setPatient(null);
                    setSelected(new Set());
                  }}
                >
                  Change
                </button>
              </div>

              {tabCount > 1 ? (
                <div className="mt-4 inline-flex rounded-md border border-gray-300 p-0.5 dark:border-gray-600">
                  {(["all", "prescriptions", "labs", "appointments"] as InvoiceSourceTab[]).map((tab) => {
                    if (tab === "prescriptions" && !canPrescriptions) return null;
                    if (tab === "labs" && !canLabs) return null;
                    if (tab === "appointments" && !canAppointments) return null;
                    const label =
                      tab === "all" ? "All" : tab === "prescriptions" ? "Rx" : tab === "labs" ? "Labs" : "Visits";
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setSourceTab(tab)}
                        className={`rounded px-3 py-1.5 text-xs font-medium ${
                          sourceTab === tab
                            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                            : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {loading ? (
                <p className="mt-6 text-sm text-gray-500">Loading…</p>
              ) : (
                <>
                  {showRx ? (
                    <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Prescriptions</h3>
                        {rxRows.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => selectAllInList(rxRows.map((r) => `rx:${r.id}`))}
                            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            Select all
                          </button>
                        ) : null}
                      </div>
                      {rxRows.length === 0 ? (
                        <p className="text-sm text-gray-500">None in range.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                              <tr>
                                <th className="w-8 px-2 py-2" />
                                <th className="px-2 py-2">Date</th>
                                <th className="px-2 py-2">Type</th>
                                <th className="px-2 py-2">Doctor</th>
                                <th className="px-2 py-2">Lines</th>
                                <th className="px-2 py-2 text-right">Est.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rxRows.map((rx) => {
                                const key = `rx:${rx.id}`;
                                const est = rx.items.reduce(
                                  (s, it) =>
                                    s +
                                    (it.quantity || 0) *
                                      (typeof it.product.sellingPrice === "number" ? it.product.sellingPrice : 0),
                                  0
                                );
                                return (
                                  <tr key={rx.id} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="px-2 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selected.has(key)}
                                        onChange={() => toggleKey(key)}
                                        className="rounded border-gray-400"
                                      />
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2">{dateKey(rx.appointment.appointmentDate)}</td>
                                    <td className="px-2 py-2">
                                      {rx.isEmergency ? (
                                        <span className="text-amber-800 dark:text-amber-300">Emergency</span>
                                      ) : (
                                        <span className="text-gray-600 dark:text-gray-400">Clinic</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-2">{rx.doctor.name}</td>
                                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400">{rx.items.length}</td>
                                    <td className="px-2 py-2 text-right font-mono text-xs">${est.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {showLabs ? (
                    <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Laboratory</h3>
                        {labRows.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => selectAllInList(labRows.map((r) => `lab:${r.id}`))}
                            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            Select all
                          </button>
                        ) : null}
                      </div>
                      {labRows.length === 0 ? (
                        <p className="text-sm text-gray-500">None in range.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                          <table className="w-full min-w-[560px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                              <tr>
                                <th className="w-8 px-2 py-2" />
                                <th className="px-2 py-2">Date</th>
                                <th className="px-2 py-2">Doctor</th>
                                <th className="px-2 py-2">Tests</th>
                                <th className="px-2 py-2">Status</th>
                                <th className="px-2 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {labRows.map((row) => {
                                const key = `lab:${row.id}`;
                                return (
                                  <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="px-2 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selected.has(key)}
                                        onChange={() => toggleKey(key)}
                                        className="rounded border-gray-400"
                                      />
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2">{dateKey(row.appointment.appointmentDate)}</td>
                                    <td className="px-2 py-2">{row.doctor.name}</td>
                                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400">{row.itemCount}</td>
                                    <td className="px-2 py-2 text-xs uppercase text-gray-500">{row.status}</td>
                                    <td className="px-2 py-2 text-right font-mono text-xs">${(row.totalAmount ?? 0).toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {showAppts ? (
                    <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-800">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Visits (calendar services)</h3>
                        {apptRows.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => selectAllInList(apptRows.map((r) => `apt:${r.id}`))}
                            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          >
                            Select all
                          </button>
                        ) : null}
                      </div>
                      {apptRows.length === 0 ? (
                        <p className="text-sm text-gray-500">None in range.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                          <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800/80 dark:text-gray-400">
                              <tr>
                                <th className="w-8 px-2 py-2" />
                                <th className="px-2 py-2">Date</th>
                                <th className="px-2 py-2">Doctor</th>
                                <th className="px-2 py-2">Services</th>
                                <th className="px-2 py-2 text-right">Booking</th>
                              </tr>
                            </thead>
                            <tbody>
                              {apptRows.map((row) => {
                                const key = `apt:${row.id}`;
                                return (
                                  <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="px-2 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selected.has(key)}
                                        onChange={() => toggleKey(key)}
                                        className="rounded border-gray-400"
                                      />
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2">{dateKey(row.appointmentDate)}</td>
                                    <td className="px-2 py-2">{row.doctor.name}</td>
                                    <td className="max-w-xs truncate px-2 py-2 text-gray-600 dark:text-gray-400" title={row.servicesSummary ?? ""}>
                                      {row.serviceCount > 0 ? `${row.serviceCount} · ${row.servicesSummary ?? ""}` : "—"}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono text-xs">${(row.totalAmount ?? 0).toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              )}

              {canAppointments && canPrescriptions && patient ? (
                <label className="mt-6 flex max-w-lg cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={linkVisitFromRx}
                    onChange={(e) => setLinkVisitFromRx(e.target.checked)}
                    className="mt-1 rounded border-gray-400"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Also bill calendar services for the visit of each selected prescription.
                  </span>
                </label>
              ) : null}
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <Button
            size="sm"
            disabled={!patient || submitting || !branchId || (!hasAnySelection && !visitFromRxOk)}
            onClick={handlePrint}
          >
            {submitting ? "Preparing…" : "Print"}
          </Button>
        </div>
      </div>
    </div>
  );
}
