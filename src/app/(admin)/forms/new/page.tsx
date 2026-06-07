"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const EMPTY_NEW_FORM_SNAPSHOT = JSON.stringify({ title: "", description: "" });

function newFormSnapshot(title: string, description: string): string {
  return JSON.stringify({ title: title.trim(), description: description.trim() });
}

export default function NewFormPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("forms.create");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tryNavigateToForms = useCallback(async () => {
    if (newFormSnapshot(title, description) === EMPTY_NEW_FORM_SNAPSHOT) {
      router.push("/forms");
      return;
    }
    const res = await Swal.fire({
      icon: "warning",
      title: "Discard unsaved data?",
      text: "You have entered form details that are not saved. Leave and lose your changes?",
      showCancelButton: true,
      confirmButtonText: "Yes",
      cancelButtonText: "No",
      reverseButtons: true,
    });
    if (res.isConfirmed) router.push("/forms");
  }, [title, description, router]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (newFormSnapshot(title, description) === EMPTY_NEW_FORM_SNAPSHOT) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [title, description]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await authFetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed");
        return;
      }
      router.push(`/forms/${data.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!hasPermission("forms.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New form" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New form" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to create forms.</p>
        <Link href="/forms" className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400">
          ← Back to forms
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New form" />
        <button
          type="button"
          onClick={() => void tryNavigateToForms()}
          className="text-left text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← All forms
        </button>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-w-xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-6"
      >
        <div>
          <Label>Title *</Label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            placeholder="e.g. Patient intake questionnaire"
          />
        </div>
        <div className="mt-4">
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            placeholder="Optional — shown at the top of the form"
          />
        </div>
        {error ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="submit" size="sm" disabled={submitting || !title.trim()}>
            {submitting ? "Creating…" : "Create and edit fields"}
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => void tryNavigateToForms()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
