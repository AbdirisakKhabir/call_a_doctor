"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  CUSTOM_FORM_FIELD_TYPES,
  type CustomFormFieldType,
  fieldTypeNeedsOptions,
} from "@/lib/custom-form-field-types";
import { PlusIcon, TrashBinIcon } from "@/icons";

type ApiField = {
  id: number;
  sortOrder: number;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  options: unknown;
};

type ApiForm = {
  id: number;
  title: string;
  description: string | null;
  isPublished: boolean;
  fields: ApiField[];
};

type BuilderField = {
  key: string;
  fieldType: CustomFormFieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  /** One option per line */
  optionsText: string;
};

function newKey() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function optionsToText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw.map((x) => (typeof x === "string" ? x : String(x))).join("\n");
}

function textToOptions(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Stable snapshot for dirty checks (matches saved payload shape). */
function snapshotForm(
  title: string,
  description: string,
  isPublished: boolean,
  fields: BuilderField[]
): string {
  return JSON.stringify({
    title: title.trim(),
    description: description.trim(),
    isPublished,
    fields: fields.map((f) => ({
      fieldType: f.fieldType,
      label: f.label.trim(),
      placeholder: f.placeholder.trim() || null,
      helpText: f.helpText.trim() || null,
      required: f.required,
      options: fieldTypeNeedsOptions(f.fieldType) ? textToOptions(f.optionsText) : null,
    })),
  });
}

function defaultBuilderField(type: CustomFormFieldType = "SHORT_TEXT"): BuilderField {
  const label =
    type === "SHORT_TEXT"
      ? "Question"
      : CUSTOM_FORM_FIELD_TYPES.find((t) => t.value === type)?.label ?? "Question";
  return {
    key: newKey(),
    fieldType: type,
    label,
    placeholder: "",
    helpText: "",
    required: false,
    optionsText: "Option 1\nOption 2",
  };
}

export default function EditFormPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { hasPermission } = useAuth();
  const canView = hasPermission("forms.view");
  const canEdit = hasPermission("forms.edit");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [addFieldType, setAddFieldType] = useState<CustomFormFieldType>("SHORT_TEXT");
  const baselineSnapshotRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id < 1) {
      setLoadError("Invalid form");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const res = await authFetch(`/api/forms/${id}`);
      const data = (await res.json()) as ApiForm & { error?: string };
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : "Failed to load");
        return;
      }
      const mapped = (data.fields ?? []).map((f) => ({
        key: newKey(),
        fieldType: (CUSTOM_FORM_FIELD_TYPES.some((t) => t.value === f.fieldType)
          ? f.fieldType
          : "SHORT_TEXT") as CustomFormFieldType,
        label: f.label,
        placeholder: f.placeholder ?? "",
        helpText: f.helpText ?? "",
        required: f.required,
        optionsText: optionsToText(f.options),
      }));
      baselineSnapshotRef.current = snapshotForm(
        data.title,
        data.description ?? "",
        data.isPublished,
        mapped
      );
      setTitle(data.title);
      setDescription(data.description ?? "");
      setIsPublished(data.isPublished);
      setFields(mapped);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, load]);

  const tryNavigateToForms = useCallback(async () => {
    const baseline = baselineSnapshotRef.current;
    if (baseline === null) {
      router.push("/forms");
      return;
    }
    if (snapshotForm(title, description, isPublished, fields) === baseline) {
      router.push("/forms");
      return;
    }
    const res = await Swal.fire({
      icon: "warning",
      title: "Discard unsaved changes?",
      text: "You have unsaved changes to this form. Leave and discard them?",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "No",
      reverseButtons: true,
    });
    if (res.isConfirmed) router.push("/forms");
  }, [title, description, isPublished, fields, router]);

  useEffect(() => {
    if (!canEdit || loading || loadError) return;
    const baseline = baselineSnapshotRef.current;
    const t = title;
    const d = description;
    const p = isPublished;
    const flds = fields;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (baseline === null) return;
      if (snapshotForm(t, d, p, flds) === baseline) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [canEdit, loading, loadError, title, description, isPublished, fields]);

  function moveField(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const t = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = t;
      return copy;
    });
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, patch: Partial<BuilderField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function handleSave() {
    setSaveError("");
    setSaveOk(false);
    if (!title.trim()) {
      setSaveError("Title is required");
      return;
    }
    for (const f of fields) {
      if (!f.label.trim()) {
        setSaveError("Every field needs a label");
        return;
      }
      if (fieldTypeNeedsOptions(f.fieldType)) {
        const opts = textToOptions(f.optionsText);
        if (opts.length === 0) {
          setSaveError(`Add at least one option for “${f.label.trim()}”`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          isPublished,
          fields: fields.map((f) => ({
            fieldType: f.fieldType,
            label: f.label.trim(),
            placeholder: f.placeholder.trim() || null,
            helpText: f.helpText.trim() || null,
            required: f.required,
            options: fieldTypeNeedsOptions(f.fieldType) ? textToOptions(f.optionsText) : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      baselineSnapshotRef.current = snapshotForm(title, description, isPublished, fields);
      setSaveOk(true);
      router.refresh();
      setTimeout(() => setSaveOk(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit form" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit form" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit form" />
        <p className="mt-6 text-sm text-error-600 dark:text-error-400">{loadError}</p>
        <Link href="/forms" className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400">
          ← All forms
        </Link>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <PageBreadCrumb pageTitle={title || "Form"} />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit this form.</p>
        <Link href="/forms" className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400">
          ← All forms
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Edit form" />
        <button
          type="button"
          onClick={() => void tryNavigateToForms()}
          className="text-left text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← All forms
        </button>
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Form details</h3>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Title *</Label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                placeholder="Optional introduction"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600"
              />
              Published (ready to share when you add a public link later)
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Questions</h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={addFieldType}
                onChange={(e) => setAddFieldType(e.target.value as CustomFormFieldType)}
                className="h-9 rounded-lg border border-gray-200 bg-transparent px-2 text-sm dark:border-gray-700 dark:text-white"
              >
                {CUSTOM_FORM_FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                type="button"
                onClick={() => setFields((prev) => [...prev, defaultBuilderField(addFieldType)])}
              >
                <PlusIcon className="mr-1 h-4 w-4" />
                Add question
              </Button>
            </div>
          </div>

          {fields.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No questions yet. Add one above.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {fields.map((f, index) => (
                <li
                  key={f.key}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">#{index + 1}</span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === fields.length - 1}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="rounded p-1 text-gray-400 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
                        title="Remove"
                      >
                        <TrashBinIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label>Input type</Label>
                      <select
                        value={f.fieldType}
                        onChange={(e) => {
                          const nt = e.target.value as CustomFormFieldType;
                          updateField(index, {
                            fieldType: nt,
                            optionsText: fieldTypeNeedsOptions(nt) ? f.optionsText || "Option 1\nOption 2" : "",
                          });
                        }}
                        className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
                      >
                        {CUSTOM_FORM_FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Label *</Label>
                      <input
                        value={f.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <Label>Placeholder</Label>
                      <input
                        value={f.placeholder}
                        onChange={(e) => updateField(index, { placeholder: e.target.value })}
                        className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600"
                        />
                        Required
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Help text</Label>
                      <input
                        value={f.helpText}
                        onChange={(e) => updateField(index, { helpText: e.target.value })}
                        className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                        placeholder="Optional hint under the field"
                      />
                    </div>
                    {fieldTypeNeedsOptions(f.fieldType) ? (
                      <div className="md:col-span-2">
                        <Label>Choices (one per line) *</Label>
                        <textarea
                          value={f.optionsText}
                          onChange={(e) => updateField(index, { optionsText: e.target.value })}
                          rows={4}
                          className="mt-1 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 font-mono text-sm dark:border-gray-700 dark:text-white"
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Preview</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Read-only preview of how questions appear.</p>
          <div className="mt-4 space-y-4 rounded-lg border border-dashed border-gray-200 p-4 dark:border-gray-700">
            {title ? <h4 className="font-medium text-gray-900 dark:text-white">{title}</h4> : null}
            {description ? <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p> : null}
            {fields.length === 0 ? (
              <p className="text-sm text-gray-400">No questions.</p>
            ) : (
              fields.map((f, i) => (
                <div key={f.key} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 dark:border-gray-800">
                  <Label>
                    {f.label}
                    {f.required ? <span className="text-error-500"> *</span> : null}
                  </Label>
                  {f.helpText ? (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{f.helpText}</p>
                  ) : null}
                  <div className="mt-1">
                    {f.fieldType === "LONG_TEXT" ? (
                      <textarea
                        readOnly
                        placeholder={f.placeholder || undefined}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                        rows={2}
                      />
                    ) : f.fieldType === "CHECKBOX" ? (
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" disabled className="h-4 w-4 rounded border-gray-300" />
                        {f.placeholder || "Yes"}
                      </label>
                    ) : f.fieldType === "RADIO" ? (
                      <div className="space-y-1">
                        {textToOptions(f.optionsText).map((opt, j) => (
                          <label key={j} className="flex items-center gap-2 text-sm">
                            <input type="radio" disabled name={`p-${i}`} className="h-4 w-4 border-gray-300" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : f.fieldType === "MULTI_CHECK" ? (
                      <div className="space-y-1">
                        {textToOptions(f.optionsText).map((opt, j) => (
                          <label key={j} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" disabled className="h-4 w-4 rounded border-gray-300" />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : f.fieldType === "SELECT" ? (
                      <select
                        disabled
                        className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">{f.placeholder || "Choose…"}</option>
                        {textToOptions(f.optionsText).map((opt, j) => (
                          <option key={j} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        readOnly
                        type={
                          f.fieldType === "EMAIL"
                            ? "email"
                            : f.fieldType === "NUMBER"
                              ? "number"
                              : f.fieldType === "DATE"
                                ? "date"
                                : "text"
                        }
                        placeholder={f.placeholder || undefined}
                        className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 pb-8">
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save form"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void tryNavigateToForms()}>
            Cancel
          </Button>
          {saveError ? <span className="text-sm text-error-600 dark:text-error-400">{saveError}</span> : null}
          {saveOk ? <span className="text-sm text-green-700 dark:text-green-400">Saved.</span> : null}
        </div>
      </div>
    </div>
  );
}
