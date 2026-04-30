"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  fieldTypeNeedsOptions,
  type CustomFormFieldType,
} from "@/lib/custom-form-field-types";
import { decodeOptionsList } from "@/lib/custom-form-answer-encode";
import { useUnsavedChangesPrompt } from "@/hooks/useUnsavedChangesPrompt";

type PublishedForm = {
  id: number;
  title: string;
  description: string | null;
  updatedAt: string;
  _count: { fields: number };
};

type FormField = {
  id: number;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  options: unknown;
};

type FormDetail = {
  id: number;
  title: string;
  description: string | null;
  fields: FormField[];
};

type AnswerValue = string | boolean | string[];

const SWITCH_FORM_MESSAGE = "You have unsaved answers on this form. Switch to another form anyway?";
const CANCEL_MESSAGE = "You have unsaved clinic note data. Leave without saving?";

type Props = {
  /** When null, submission is not tied to a booking and success returns to client history. */
  appointmentId: number | null;
  patientId: number;
  patientLabel: string;
  /** If set, selects this published form once the list has loaded. */
  initialFormId?: number | null;
};

export default function ClinicFormsPageContent({
  appointmentId,
  patientId,
  patientLabel,
  initialFormId = null,
}: Props) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission("patient_history.create") || hasPermission("forms.edit");

  const [published, setPublished] = useState<PublishedForm[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useUnsavedChangesPrompt(hasUnsavedChanges, CANCEL_MESSAGE);

  const loadPublished = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await authFetch("/api/forms/published");
      if (res.ok) setPublished(await res.json());
      else setPublished([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPublished();
  }, [loadPublished]);

  useEffect(() => {
    if (initialFormId == null || !published.length) return;
    const ok = published.some((f) => f.id === initialFormId);
    if (ok) setSelectedId(initialFormId);
  }, [initialFormId, published]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      setAnswers({});
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError("");
    authFetch(`/api/forms/${selectedId}`)
      .then(async (res) => {
        const data = (await res.json()) as FormDetail & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Could not load form");
          setDetail(null);
          return;
        }
        setDetail(data);
        const init: Record<number, AnswerValue> = {};
        for (const f of data.fields ?? []) {
          if (f.fieldType === "CHECKBOX") init[f.id] = false;
          else if (f.fieldType === "MULTI_CHECK") init[f.id] = [];
          else init[f.id] = "";
        }
        setAnswers(init);
        setHasUnsavedChanges(false);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function trySelectForm(id: number) {
    if (id === selectedId) return;
    if (hasUnsavedChanges && !window.confirm(SWITCH_FORM_MESSAGE)) return;
    setSelectedId(id);
  }

  function setAnswer(fieldId: number, v: AnswerValue) {
    setHasUnsavedChanges(true);
    setAnswers((prev) => ({ ...prev, [fieldId]: v }));
  }

  function toggleMulti(fieldId: number, option: string, checked: boolean) {
    setHasUnsavedChanges(true);
    setAnswers((prev) => {
      const cur = Array.isArray(prev[fieldId]) ? [...(prev[fieldId] as string[])] : [];
      if (checked) {
        if (!cur.includes(option)) cur.push(option);
      } else {
        const i = cur.indexOf(option);
        if (i >= 0) cur.splice(i, 1);
      }
      return { ...prev, [fieldId]: cur };
    });
  }

  function goBackToOrigin() {
    if (appointmentId != null) router.push(`/appointments/${appointmentId}`);
    else router.push(`/patients/${patientId}/history`);
  }

  function handleCancelClick() {
    if (hasUnsavedChanges && !window.confirm(CANCEL_MESSAGE)) return;
    goBackToOrigin();
  }

  async function handleSubmit() {
    if (!detail || !canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of detail.fields) {
        payload[String(f.id)] = answers[f.id];
      }
      const body: Record<string, unknown> = {
        patientId,
        answers: payload,
      };
      if (appointmentId != null) body.appointmentId = appointmentId;
      const res = await authFetch(`/api/forms/${detail.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Submit failed");
        return;
      }
      setHasUnsavedChanges(false);
      if (appointmentId != null) {
        router.push(`/appointments/${appointmentId}`);
      } else {
        router.push(`/patients/${patientId}/history`);
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const backHref =
    appointmentId != null ? `/appointments/${appointmentId}` : `/patients/${patientId}/history`;
  const backLabel = appointmentId != null ? "← Back to booking" : "← Back to client history";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <Link
          href={backHref}
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {backLabel}
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{patientLabel}</p>

      <div className="flex min-h-[min(70vh,48rem)] flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40 md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 dark:border-gray-700 md:w-72 md:border-b-0 md:border-r">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Forms
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {listLoading ? (
              <p className="px-2 text-sm text-gray-500">Loading…</p>
            ) : published.length === 0 ? (
              <p className="px-2 text-sm text-gray-500 dark:text-gray-400">
                No published forms. An admin can create and publish forms under Forms.
              </p>
            ) : (
              <ul className="space-y-1">
                {published.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => trySelectForm(f.id)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                        selectedId === f.id
                          ? "bg-brand-500 text-white"
                          : "bg-gray-50 text-gray-900 hover:bg-gray-100 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
                      }`}
                    >
                      <span className="font-medium">{f.title}</span>
                      <span
                        className={`mt-0.5 block text-xs ${
                          selectedId === f.id ? "text-white/80" : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {f._count.fields} field{f._count.fields === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedId == null ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a form on the left to fill it for this client
              {appointmentId != null ? " for this visit" : "."}.
            </div>
          ) : detailLoading ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">Loading form…</div>
          ) : detail ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{detail.title}</h2>
                {detail.description ? (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail.description}</p>
                ) : null}
                <div className="mt-4 space-y-4">
                  {detail.fields.map((f) => {
                    const opts = fieldTypeNeedsOptions(f.fieldType)
                      ? decodeOptionsList(f.options)
                      : [];
                    const ft = f.fieldType as CustomFormFieldType | string;
                    return (
                      <div
                        key={f.id}
                        className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0 dark:border-gray-800"
                      >
                        <Label>
                          {f.label}
                          {f.required ? <span className="text-error-500"> *</span> : null}
                        </Label>
                        {f.helpText ? (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{f.helpText}</p>
                        ) : null}
                        <div className="mt-1">
                          {ft === "LONG_TEXT" ? (
                            <textarea
                              value={String(answers[f.id] ?? "")}
                              onChange={(e) => setAnswer(f.id, e.target.value)}
                              placeholder={f.placeholder ?? undefined}
                              rows={3}
                              disabled={!canSubmit}
                              className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                            />
                          ) : ft === "CHECKBOX" ? (
                            <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                              <input
                                type="checkbox"
                                checked={Boolean(answers[f.id])}
                                onChange={(e) => setAnswer(f.id, e.target.checked)}
                                disabled={!canSubmit}
                                className="h-4 w-4 rounded border-gray-300 text-brand-600"
                              />
                              {f.placeholder || "Yes"}
                            </label>
                          ) : ft === "RADIO" ? (
                            <div className="space-y-1">
                              {opts.map((opt) => (
                                <label key={opt} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`field-${f.id}`}
                                    value={opt}
                                    checked={answers[f.id] === opt}
                                    onChange={() => setAnswer(f.id, opt)}
                                    disabled={!canSubmit}
                                    className="h-4 w-4 border-gray-300 text-brand-600"
                                  />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          ) : ft === "MULTI_CHECK" ? (
                            <div className="space-y-1">
                              {opts.map((opt) => {
                                const arr = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
                                return (
                                  <label key={opt} className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={arr.includes(opt)}
                                      onChange={(e) => toggleMulti(f.id, opt, e.target.checked)}
                                      disabled={!canSubmit}
                                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                                    />
                                    {opt}
                                  </label>
                                );
                              })}
                            </div>
                          ) : ft === "SELECT" ? (
                            <select
                              value={String(answers[f.id] ?? "")}
                              onChange={(e) => setAnswer(f.id, e.target.value)}
                              disabled={!canSubmit}
                              className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                            >
                              <option value="">{f.placeholder || "Choose…"}</option>
                              {opts.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={
                                ft === "EMAIL"
                                  ? "email"
                                  : ft === "NUMBER"
                                    ? "number"
                                    : ft === "DATE"
                                      ? "date"
                                      : "text"
                              }
                              value={String(answers[f.id] ?? "")}
                              onChange={(e) => setAnswer(f.id, e.target.value)}
                              placeholder={f.placeholder ?? undefined}
                              disabled={!canSubmit}
                              className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-6">
                {error ? <p className="mb-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
                {!canSubmit ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    You can view this form but need permission to record responses (patient history — create).
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
                      {submitting ? "Saving…" : "Save for client"}
                    </Button>
                    <Button variant="outline" type="button" size="sm" onClick={handleCancelClick}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">Could not load.</div>
          )}
        </div>
      </div>
    </div>
  );
}
