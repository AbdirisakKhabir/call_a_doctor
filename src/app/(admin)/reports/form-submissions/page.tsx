"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type FormOption = { id: number; title: string };

type AnswerRow = {
  id: number;
  fieldId: number;
  fieldLabel: string;
  fieldType: string;
  value: string;
};

type SubmissionRow = {
  id: number;
  submittedAt: string;
  form: { id: number; title: string };
  patient: { id: number; patientCode: string; name: string };
  appointment: {
    id: number;
    appointmentDate: string;
    startTime: string;
    branch: { name: string };
  } | null;
  submittedBy: { id: number; name: string | null; email: string } | null;
  answers: AnswerRow[];
};

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatAnswer(fieldType: string, value: string): string {
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

export default function FormSubmissionsReportPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("forms.view");

  const [forms, setForms] = useState<FormOption[]>([]);
  const [formId, setFormId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!canView) return;
    authFetch("/api/forms").then(async (res) => {
      if (!res.ok) return;
      const list = (await res.json()) as FormOption[];
      setForms(Array.isArray(list) ? list.map((f) => ({ id: f.id, title: f.title })) : []);
    });
  }, [canView]);

  async function runReport() {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (formId.trim()) sp.set("formId", formId.trim());
      if (patientId.trim()) sp.set("patientId", patientId.trim());
      if (from.trim()) sp.set("from", from.trim());
      if (to.trim()) sp.set("to", to.trim());
      sp.set("take", "200");
      const res = await authFetch(`/api/forms/submissions?${sp.toString()}`);
      const json = (await res.json()) as { data?: SubmissionRow[]; total?: number; error?: string };
      if (!res.ok) {
        alert(json.error || "Failed");
        return;
      }
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
      setExpanded({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canView) void runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [canView]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Form responses report" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Form responses report" />
        <Link href="/reports/new-members" className="text-sm font-medium text-brand-600 dark:text-brand-400">
          ← Client reports
        </Link>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3 md:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Form</Label>
            <select
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">All forms</option>
              {forms.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Client ID</Label>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Numeric client id"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <Label>Submitted date range</Label>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <DateField
                  label="From"
                  value={from}
                  onChange={setFrom}
                  max={to || undefined}
                  placeholder="Start date"
                />
              </div>
              <div className="min-w-0 flex-1">
                <DateField
                  label="To"
                  value={to}
                  onChange={setTo}
                  min={from || undefined}
                  placeholder="End date"
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const today = toIsoDateLocal(new Date());
                  setFrom(today);
                  setTo(today);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 6);
                  setFrom(toIsoDateLocal(start));
                  setTo(toIsoDateLocal(end));
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Last 7 days
              </button>
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 29);
                  setFrom(toIsoDateLocal(start));
                  setTo(toIsoDateLocal(end));
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Last 30 days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const start = new Date(now.getFullYear(), now.getMonth(), 1);
                  setFrom(toIsoDateLocal(start));
                  setTo(toIsoDateLocal(now));
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Month to date
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Clear dates
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Button type="button" size="sm" disabled={loading} onClick={() => void runReport()}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">{total} submission(s)</span>
          {from || to ? (
            <span className="mt-2 block text-xs text-gray-500 dark:text-gray-400 sm:mt-0 sm:ml-3 sm:inline">
              {from && to
                ? `Range: ${from} → ${to}`
                : from
                  ? `From ${from}`
                  : to
                    ? `Through ${to}`
                    : ""}
            </span>
          ) : null}
        </div>
      </section>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No rows match.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{r.form.title}</span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    <Link href={`/patients/${r.patient.id}/history`} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                      {r.patient.name} ({r.patient.patientCode})
                    </Link>
                    {" · "}
                    {new Date(r.submittedAt).toLocaleString()}
                    {r.appointment
                      ? ` · Visit ${new Date(r.appointment.appointmentDate).toLocaleDateString()} ${r.appointment.startTime}`
                      : ""}
                    {r.submittedBy?.name || r.submittedBy?.email
                      ? ` · ${r.submittedBy?.name || r.submittedBy?.email}`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                  className="text-sm font-medium text-brand-600 dark:text-brand-400"
                >
                  {expanded[r.id] ? "Hide answers" : "Show answers"}
                </button>
              </div>
              {expanded[r.id] ? (
                <dl className="space-y-2 px-4 py-3 text-sm">
                  {r.answers.map((a) => (
                    <div key={a.id} className="grid gap-0.5 border-t border-gray-50 pt-2 first:border-t-0 first:pt-0 dark:border-gray-800 sm:grid-cols-[minmax(0,14rem)_1fr]">
                      <dt className="font-medium text-gray-700 dark:text-gray-300">{a.fieldLabel}</dt>
                      <dd className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                        {formatAnswer(a.fieldType, a.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
