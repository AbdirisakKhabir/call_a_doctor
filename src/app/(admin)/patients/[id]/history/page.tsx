"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CalenderIcon, DocsIcon, ListIcon, UserCircleIcon, BoxCubeIcon } from "@/icons";

type ChartPatient = {
  id: number;
  patientCode: string;
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  notes: string | null;
  accountBalance: number;
  isActive: boolean;
};

type ClinicalNote = {
  id: number;
  type: string;
  notes: string;
  createdAt: string;
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string } | null;
};

type LabOrderRow = {
  id: number;
  status: string;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  doctor: { id: number; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
  };
  items: {
    id: number;
    unitPrice: number;
    resultValue: string | null;
    resultUnit: string | null;
    status: string;
    labTest: { id: number; name: string; unit: string | null; normalRange: string | null; code: string | null };
  }[];
};

type PrescriptionRow = {
  id: number;
  status: string;
  notes: string | null;
  isEmergency: boolean;
  createdAt: string;
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
    dosage: string | null;
    instructions: string | null;
    product: { id: number; name: string; code: string };
  }[];
};

function noteTypeLabel(t: string) {
  const map: Record<string, string> = {
    chief_complaint: "Chief complaint",
    history: "History",
    examination: "Examination",
    diagnosis: "Diagnosis",
    notes: "Notes",
  };
  return map[t] || t;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PatientHistoryViewPage() {
  const params = useParams();
  const idParam = params?.id;
  const patientId = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : "";

  const { hasPermission } = useAuth();
  const canView = hasPermission("patients.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    patient: ChartPatient;
    clinicalNotes: ClinicalNote[];
    labOrders: LabOrderRow[];
    prescriptions: PrescriptionRow[];
    canViewNotes: boolean;
    canViewLabs: boolean;
    canViewPrescriptions: boolean;
  } | null>(null);

  useEffect(() => {
    if (!patientId || !canView) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch(`/api/patients/${patientId}/chart`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, canView]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Client history" />
        <p className="mt-6 text-sm text-gray-500">You do not have permission to view clients.</p>
      </div>
    );
  }

  if (!patientId) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Client history" />
        <p className="mt-6 text-sm text-gray-500">Invalid client.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Client history" />
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/patients/${patientId}/care-files`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Client files
          </Link>
          <Link
            href="/patients"
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            ← Back to clients
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-8">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/40">
            <div className="border-b border-gray-100 bg-gradient-to-r from-brand-500/10 to-violet-500/5 px-6 py-5 dark:border-gray-800">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow dark:bg-gray-800">
                  <UserCircleIcon className="h-8 w-8 text-brand-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{data.patient.name}</h1>
                  <p className="mt-0.5 font-mono text-sm text-gray-500">{data.patient.patientCode}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {data.patient.phone && <span>Phone: {data.patient.phone}</span>}
                    {data.patient.mobile && <span>Mobile: {data.patient.mobile}</span>}
                    {data.patient.email && <span>{data.patient.email}</span>}
                    {data.patient.gender && <span>{data.patient.gender}</span>}
                    {data.patient.dateOfBirth && (
                      <span>DOB {new Date(data.patient.dateOfBirth).toLocaleDateString()}</span>
                    )}
                    <span className="font-mono">Balance ${data.patient.accountBalance.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {data.patient.notes?.trim() && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  <span className="font-semibold">Chart alerts / demographics notes: </span>
                  {data.patient.notes}
                </div>
              )}
            </div>
          </div>

          {data.canViewNotes && (
            <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40">
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <ListIcon className="h-6 w-6 text-brand-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Clinical notes</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Encounter documentation by type and date</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.clinicalNotes.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-500">No clinical notes recorded yet.</p>
              ) : (
                data.clinicalNotes.map((n) => (
                  <article key={n.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {noteTypeLabel(n.type)}
                      </span>
                      <span>{formatDate(n.createdAt)}</span>
                      <span>·</span>
                      <span>{n.doctor.name}</span>
                      {n.appointment && (
                        <>
                          <span>·</span>
                          <span>
                            Visit {formatDate(n.appointment.appointmentDate)} {n.appointment.startTime}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">{n.notes}</p>
                  </article>
                ))
              )}
            </div>
          </section>
          )}

          {!data.canViewNotes && (
            <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to view clinical notes.</p>
          )}

          {data.canViewLabs && (
            <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40">
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <DocsIcon className="h-6 w-6 text-brand-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Laboratory orders &amp; results</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tests, fees, and recorded results</p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              {data.labOrders.length === 0 ? (
                <p className="text-center text-sm text-gray-500">No lab orders for this client.</p>
              ) : (
                data.labOrders.map((order) => (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <CalenderIcon className="h-4 w-4" />
                        {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
                        <span className="text-gray-400">·</span>
                        {order.appointment.branch.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Dr. {order.doctor.name}</span>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium uppercase dark:bg-gray-700">{order.status}</span>
                        <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                          ${(order.totalAmount ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {order.notes?.trim() && (
                      <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
                        {order.notes}
                      </p>
                    )}
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">{item.labTest.name}</p>
                            {item.labTest.code && (
                              <p className="text-xs text-gray-500">Code: {item.labTest.code}</p>
                            )}
                            {item.labTest.normalRange && (
                              <p className="text-xs text-gray-500">Ref: {item.labTest.normalRange}</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">Line fee ${(item.unitPrice ?? 0).toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p
                              className={`text-sm font-semibold ${
                                item.resultValue ? "text-emerald-700 dark:text-emerald-400" : "text-gray-400"
                              }`}
                            >
                              {item.resultValue ?? "—"}
                              {item.resultUnit && item.resultValue ? ` ${item.resultUnit}` : item.resultUnit ? ` ${item.resultUnit}` : ""}
                            </p>
                            <p className="text-[10px] uppercase text-gray-400">{item.status}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
          )}

          {!data.canViewLabs && (
            <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to view laboratory records.</p>
          )}

          {data.canViewPrescriptions && (
            <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40">
            <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
              <BoxCubeIcon className="h-6 w-6 text-brand-500" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Medications &amp; prescriptions</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Prescribed products, dose, and instructions</p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              {data.prescriptions.length === 0 ? (
                <p className="text-center text-sm text-gray-500">No prescriptions for this client.</p>
              ) : (
                data.prescriptions.map((rx) => (
                  <div
                    key={rx.id}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <CalenderIcon className="h-4 w-4" />
                        {formatDate(rx.appointment.appointmentDate)} · {rx.appointment.startTime}
                        <span className="text-gray-400">·</span>
                        {rx.appointment.branch.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Dr. {rx.doctor.name}</span>
                        {rx.isEmergency && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                            Emergency
                          </span>
                        )}
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium uppercase dark:bg-gray-700">{rx.status}</span>
                      </div>
                    </div>
                    {rx.notes?.trim() && (
                      <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">{rx.notes}</p>
                    )}
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {rx.items.map((line) => (
                        <li key={line.id} className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{line.product.name}</p>
                          <p className="text-xs text-gray-500">{line.product.code}</p>
                          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                            Qty {line.quantity}
                            {line.dosage && <span> · {line.dosage}</span>}
                            {line.instructions && <span> · {line.instructions}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
          )}

          {!data.canViewPrescriptions && (
            <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to view prescriptions.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
