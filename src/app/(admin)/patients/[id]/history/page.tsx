"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  FlaskConical,
  FolderOpen,
  ListChecks,
  Pill,
  Plus,
  User,
} from "lucide-react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { Modal } from "@/components/ui/modal";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { groupLabOrderRowsByCategoryAndPanel } from "@/lib/lab-order-group";

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
    notes: string | null;
    panelParentTest: { id: number; name: string } | null;
    labTest: {
      id: number;
      name: string;
      unit: string | null;
      normalRange: string | null;
      code: string | null;
      category: { id: number; name: string };
    };
  }[];
};

type FormAnswerRow = {
  id: number;
  fieldId: number;
  fieldLabel: string;
  fieldType: string;
  value: string;
};

type FormResponseRow = {
  id: number;
  submittedAt: string;
  form: { id: number; title: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { id: number; name: string };
  } | null;
  submittedBy: { id: number; name: string | null; email: string } | null;
  answers: FormAnswerRow[];
};

type PublishedFormListItem = {
  id: number;
  title: string;
  description: string | null;
  _count: { fields: number };
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFormAnswerDisplay(fieldType: string, value: string): string {
  if (fieldType === "CHECKBOX") return value === "1" ? "Yes" : "No";
  if (fieldType === "MULTI_CHECK") {
    try {
      const a = JSON.parse(value) as unknown;
      return Array.isArray(a) ? a.join(", ") : value;
    } catch {
      return value;
    }
  }
  return value;
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-800">
      <Icon className="h-5 w-5 shrink-0 text-gray-600 dark:text-gray-400" aria-hidden />
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{children}</h2>
    </div>
  );
}

type LabHistorySheetRow = {
  itemId: number;
  lineNo: number;
  categoryName: string;
  panelLabel: string | null;
  testName: string;
  code: string | null;
  normalRange: string;
  unit: string;
  unitPrice: number;
  resultValue: string | null;
  resultUnit: string | null;
  status: string;
  lineNotes: string | null;
};

function labOrderToSheetRows(order: LabOrderRow): LabHistorySheetRow[] {
  return order.items.map((item, index) => ({
    itemId: item.id,
    lineNo: index + 1,
    categoryName: item.labTest.category?.name ?? "Uncategorized",
    panelLabel: item.panelParentTest?.name ?? null,
    testName: item.labTest.name,
    code: item.labTest.code,
    normalRange: item.labTest.normalRange?.trim() ? item.labTest.normalRange : "—",
    unit: item.labTest.unit?.trim() ? item.labTest.unit : "—",
    unitPrice: item.unitPrice,
    resultValue: item.resultValue,
    resultUnit: item.resultUnit,
    status: item.status,
    lineNotes: item.notes,
  }));
}

function LabOrderRequestSheetCard({ order }: { order: LabOrderRow }) {
  const rows = labOrderToSheetRows(order);
  const grouped = groupLabOrderRowsByCategoryAndPanel(rows);
  const orderNo = String(order.id).padStart(6, "0");

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-950">
      <div className="border-b border-gray-200 bg-gray-100 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Lab request</p>
            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">Order #{orderNo}</p>
          </div>
          <div className="text-right text-xs text-gray-600 dark:text-gray-400">
            <p className="inline-flex flex-wrap items-center gap-x-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>
                {formatDate(order.appointment.appointmentDate)} · {order.appointment.startTime}
              </span>
            </p>
            <p className="mt-0.5">{order.appointment.branch.name}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-200/80 pt-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-300">
          <span>Dr. {order.doctor.name}</span>
          <span className="text-gray-400">·</span>
          <span className="uppercase">{order.status}</span>
          <span className="text-gray-400">·</span>
          <span className="font-mono font-semibold tabular-nums">${(order.totalAmount ?? 0).toFixed(2)}</span>
        </div>
      </div>
      {order.notes?.trim() ? (
        <div className="border-b border-gray-200 bg-amber-50/60 px-4 py-2 dark:border-gray-700 dark:bg-amber-500/5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Order notes</p>
          <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">{order.notes.trim()}</p>
        </div>
      ) : null}
      <div className="p-3 sm:p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[36rem] space-y-6">
            {grouped.map(({ categoryName, segments }) => (
              <div key={categoryName}>
                <h3 className="mb-2 border-b border-gray-200 pb-1 text-xs font-bold uppercase tracking-wide text-brand-700 dark:border-gray-700 dark:text-brand-400">
                  {categoryName}
                </h3>
                {segments.map((seg, segIdx) => (
                  <div key={`${categoryName}-${seg.panelLabel ?? "none"}-${segIdx}`} className={segIdx > 0 ? "mt-4" : ""}>
                    {seg.panelLabel ? (
                      <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Panel: {seg.panelLabel}</p>
                    ) : null}
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-brand-50 text-left dark:bg-brand-500/10">
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            #
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Test
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Ref. range
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Unit
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Fee
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Result
                          </th>
                          <th className="border border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-brand-900 dark:border-gray-700 dark:text-brand-200">
                            Notes
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {seg.rows.map((r) => (
                          <tr key={r.itemId} className="text-gray-800 dark:text-gray-200">
                            <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums dark:border-gray-700">
                              {r.lineNo}
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                              <span className="font-medium text-gray-900 dark:text-white">{r.testName}</span>
                              {r.code ? (
                                <span className="mt-0.5 block font-mono text-[10px] text-gray-500 dark:text-gray-400">
                                  {r.code}
                                </span>
                              ) : null}
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-400">
                              {r.normalRange}
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700">{r.unit}</td>
                            <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-xs tabular-nums dark:border-gray-700">
                              ${r.unitPrice.toFixed(2)}
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                              <span
                                className={
                                  r.resultValue
                                    ? "font-semibold text-emerald-800 dark:text-emerald-400"
                                    : "text-gray-400"
                                }
                              >
                                {r.resultValue ?? "—"}
                                {r.resultUnit && r.resultValue
                                  ? ` ${r.resultUnit}`
                                  : r.resultUnit
                                    ? ` ${r.resultUnit}`
                                    : ""}
                              </span>
                              <span className="mt-0.5 block text-[10px] uppercase text-gray-500">{r.status}</span>
                            </td>
                            <td className="border border-gray-200 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-400 dark:border-gray-700">
                              {r.lineNotes?.trim() || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientHistoryViewPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const patientId = typeof idParam === "string" ? idParam : Array.isArray(idParam) ? idParam[0] : "";

  const { hasPermission } = useAuth();
  const canView = hasPermission("patients.view");
  const canOpenClinicForms =
    hasPermission("patient_history.create") ||
    hasPermission("patient_history.view") ||
    hasPermission("forms.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    patient: ChartPatient;
    labOrders: LabOrderRow[];
    prescriptions: PrescriptionRow[];
    formResponses: FormResponseRow[];
    canViewLabs: boolean;
    canViewPrescriptions: boolean;
    canViewFormResponses: boolean;
  } | null>(null);

  const [formsPickerOpen, setFormsPickerOpen] = useState(false);
  const [publishedForms, setPublishedForms] = useState<PublishedFormListItem[]>([]);
  const [formsListLoading, setFormsListLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !canView) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch(`/api/patients/${patientId}/chart`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (!cancelled) {
          setData({
            ...json,
            formResponses: Array.isArray(json.formResponses) ? json.formResponses : [],
            canViewFormResponses: Boolean(json.canViewFormResponses),
            canViewLabs: Boolean(json.canViewLabs),
            canViewPrescriptions: Boolean(json.canViewPrescriptions),
          });
        }
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

  useEffect(() => {
    if (!formsPickerOpen) return;
    let cancelled = false;
    setFormsListLoading(true);
    authFetch("/api/forms/published")
      .then(async (res) => {
        if (cancelled || !res.ok) {
          if (!cancelled) setPublishedForms([]);
          return;
        }
        const payload = (await res.json()) as unknown;
        if (cancelled) return;
        setPublishedForms(Array.isArray(payload) ? (payload as PublishedFormListItem[]) : []);
      })
      .finally(() => {
        if (!cancelled) setFormsListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formsPickerOpen]);

  function closeFormsPicker() {
    setFormsPickerOpen(false);
    setPublishedForms([]);
  }

  function selectFormForHistoryClient(formId: number) {
    closeFormsPicker();
    router.push(`/patients/${patientId}/clinic-forms?formId=${formId}`);
  }

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
            href={`/patients/${patientId}/work-progress`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <ListChecks className="h-4 w-4" />
            Work progress
          </Link>
          <Link
            href={`/patients/${patientId}/care-files`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
          >
            <FolderOpen className="h-4 w-4" />
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
        <div className="space-y-10">
          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3 md:p-6">
            <div className="mb-3 flex items-start gap-3">
              <User className="mt-0.5 h-5 w-5 text-gray-600 dark:text-gray-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{data.patient.name}</h1>
                <p className="font-mono text-sm text-gray-500 dark:text-gray-400">{data.patient.patientCode}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              {data.patient.phone && <span>Phone: {data.patient.phone}</span>}
              {data.patient.mobile && <span>Mobile: {data.patient.mobile}</span>}
              {data.patient.email && <span>{data.patient.email}</span>}
              {data.patient.gender && <span>{data.patient.gender}</span>}
              {data.patient.dateOfBirth && (
                <span>DOB {new Date(data.patient.dateOfBirth).toLocaleDateString()}</span>
              )}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Balance ${data.patient.accountBalance.toFixed(2)}
              </span>
            </div>
            {data.patient.notes?.trim() ? (
              <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                <span className="font-medium text-gray-900 dark:text-white">Notes: </span>
                {data.patient.notes}
              </p>
            ) : null}
          </section>

          {data.canViewFormResponses ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-950/40 md:p-6">
              <SectionTitle icon={ClipboardList}>Form responses</SectionTitle>
              {data.formResponses.length === 0 ? (
                <p className="py-6 text-sm text-gray-500 dark:text-gray-400">No form responses yet.</p>
              ) : (
                <div className="space-y-4">
                  {data.formResponses.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/50"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-gray-200/80 pb-3 text-sm dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{r.form.title}</h3>
                        <span className="text-gray-500 dark:text-gray-400">{formatDate(r.submittedAt)}</span>
                        {r.submittedBy?.name || r.submittedBy?.email ? (
                          <span className="text-gray-500 dark:text-gray-400">
                            · {r.submittedBy?.name || r.submittedBy?.email}
                          </span>
                        ) : null}
                        {r.appointment ? (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            · <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {formatDate(r.appointment.appointmentDate)} {r.appointment.startTime} ·{" "}
                            {r.appointment.branch.name}
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 space-y-2 text-sm">
                        {r.answers.map((a) => (
                          <div
                            key={a.id}
                            className="grid gap-1 border-b border-gray-100 pb-2 last:border-0 last:pb-0 dark:border-gray-800 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4"
                          >
                            <dt className="font-medium text-gray-700 dark:text-gray-300">{a.fieldLabel}</dt>
                            <dd className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                              {formatFormAnswerDisplay(a.fieldType, a.value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {data.canViewLabs ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-950/40 md:p-6">
              <SectionTitle icon={FlaskConical}>Laboratory</SectionTitle>
              {data.labOrders.length === 0 ? (
                <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No lab orders.</p>
              ) : (
                <div className="space-y-6">
                  {data.labOrders.map((order) => (
                    <LabOrderRequestSheetCard key={order.id} order={order} />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {data.canViewPrescriptions ? (
            <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3 md:p-6">
              <SectionTitle icon={Pill}>Prescriptions</SectionTitle>
              <div className="space-y-4">
                {data.prescriptions.length === 0 ? (
                  <p className="py-4 text-sm text-gray-500 dark:text-gray-400">No prescriptions.</p>
                ) : (
                  data.prescriptions.map((rx) => (
                    <div key={rx.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="h-4 w-4 shrink-0" />
                          {formatDate(rx.appointment.appointmentDate)} · {rx.appointment.startTime}
                          <span className="text-gray-400">·</span>
                          {rx.appointment.branch.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-500">Dr. {rx.doctor.name}</span>
                          {rx.isEmergency ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              Emergency
                            </span>
                          ) : null}
                          <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium uppercase text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                            {rx.status}
                          </span>
                        </div>
                      </div>
                      {rx.notes?.trim() ? (
                        <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
                          {rx.notes}
                        </p>
                      ) : null}
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {rx.items.map((line) => (
                          <li key={line.id} className="px-4 py-3">
                            <p className="font-medium text-gray-900 dark:text-white">{line.product.name}</p>
                            <p className="text-xs text-gray-500">{line.product.code}</p>
                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                              Qty {line.quantity}
                              {line.dosage ? ` · ${line.dosage}` : ""}
                              {line.instructions ? ` · ${line.instructions}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {data && canOpenClinicForms ? (
        <>
          <button
            type="button"
            onClick={() => setFormsPickerOpen(true)}
            title="Fill a clinic form for this client"
            className="fixed bottom-6 right-6 z-[100000] flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-2 ring-white/30 transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/40 dark:bg-brand-500 dark:hover:bg-brand-400 dark:ring-gray-900/80"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
            <span className="sr-only">Open clinic forms list</span>
          </button>

          <Modal
            isOpen={formsPickerOpen}
            onClose={closeFormsPicker}
            className="max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:max-w-xl sm:p-8"
          >
            <h2 className="pr-10 text-lg font-semibold text-gray-900 dark:text-white">Choose a form</h2>
            <div className="mt-4 max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
              {formsListLoading ? (
                <p className="p-4 text-sm text-gray-500">Loading forms…</p>
              ) : publishedForms.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No published forms.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {publishedForms.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/80"
                        onClick={() => selectFormForHistoryClient(f.id)}
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{f.title}</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {f._count.fields} field{f._count.fields === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
