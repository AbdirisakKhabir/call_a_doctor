"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatClientFullName } from "@/lib/patient-name";

type Tristate = "yes" | "no" | "na";

const OPTIONS: { value: Tristate; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "Not applicable" },
];

type Appt = {
  id: number;
  status: string;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  totalAmount: number;
  completionChecklistLab: string | null;
  completionChecklistPrescription: string | null;
  completionChecklistClinicNote: string | null;
  patient: { id: number; firstName: string; lastName: string; patientCode: string; name?: string };
  branch: { id: number; name: string };
  doctor: { id: number; name: string };
};

export default function CompleteVisitWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("appointments.edit");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [appt, setAppt] = useState<Appt | null>(null);
  const [error, setError] = useState("");
  const [lab, setLab] = useState<Tristate | "">("");
  const [prescription, setPrescription] = useState<Tristate | "">("");
  const [clinicNote, setClinicNote] = useState<Tristate | "">("");
  const [resultStatus, setResultStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id)) {
      setLoading(false);
      setAppt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    authFetch(`/api/appointments/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          if (!cancelled) {
            setAppt(null);
            setError(data.error || "Failed to load");
          }
          return;
        }
        const a = data as Appt;
        if (!cancelled) {
          setAppt(a);
          setError("");
          if (a.completionChecklistLab === "yes" || a.completionChecklistLab === "no" || a.completionChecklistLab === "na") {
            setLab(a.completionChecklistLab);
          }
          if (
            a.completionChecklistPrescription === "yes" ||
            a.completionChecklistPrescription === "no" ||
            a.completionChecklistPrescription === "na"
          ) {
            setPrescription(a.completionChecklistPrescription);
          }
          if (
            a.completionChecklistClinicNote === "yes" ||
            a.completionChecklistClinicNote === "no" ||
            a.completionChecklistClinicNote === "na"
          ) {
            setClinicNote(a.completionChecklistClinicNote);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppt(null);
          setError("Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResultStatus(null);
    if (!Number.isInteger(id) || !canEdit) return;
    if (lab === "" || prescription === "" || clinicNote === "") {
      setError("Answer all three questions.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/appointments/${id}/complete-visit-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lab, prescription, clinicNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed");
        return;
      }
      const st = (data as { status?: string }).status;
      setResultStatus(typeof st === "string" ? st : null);
      if (st === "pending") {
        setError("");
      } else {
        router.push("/appointments");
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!canEdit) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Mark visit completed" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit bookings.</p>
        <Link href="/appointments" className="mt-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Back to calendar
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (!appt) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Mark visit completed" />
        <p className="mt-4 text-sm text-red-600">{error || "Booking not found."}</p>
        <Link href="/appointments" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          Back to calendar
        </Link>
      </div>
    );
  }

  if (!["scheduled", "pending"].includes(appt.status)) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Mark visit completed" />
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          This booking is already {appt.status.replace(/-/g, " ")}. Only scheduled or pending visits use this workflow.
        </p>
        <Link href={`/appointments/${appt.id}`} className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          Open booking
        </Link>
      </div>
    );
  }

  const patientName =
    appt.patient.name || formatClientFullName({ firstName: appt.patient.firstName, lastName: appt.patient.lastName });

  function triStateGroup(fieldKey: string, label: string, value: Tristate | "", setValue: (v: Tristate) => void) {
    return (
      <div>
        <Label>{label}</Label>
        <div className="mt-2 flex flex-wrap gap-4">
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                name={`completion-${fieldKey}`}
                checked={value === o.value}
                onChange={() => setValue(o.value)}
                className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Mark visit completed" />
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {patientName} ({appt.patient.patientCode}) · {appt.appointmentDate.slice(0, 10)} {appt.startTime} ·{" "}
        {appt.branch.name} · Dr. {appt.doctor.name}
      </p>

      {resultStatus === "pending" ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Pending: no clinic form recorded for this client on this visit
          </p>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Based on your answers, a clinic form (visit note) from this client is required, but none has been saved for
            this booking yet. The calendar will stay <strong>pending</strong> until someone completes a clinic form linked
            to this appointment below.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/appointments/${appt.id}/clinic-forms`}
              className="inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open clinic forms
            </Link>
            <Link
              href={`/appointments/${appt.id}`}
              className="inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
            >
              Open booking
            </Link>
            <Link href="/appointments" className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600">
              Back to calendar
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mx-auto mt-6 max-w-lg space-y-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Record whether this visit involved lab work, a prescription, and/or a clinic note. If both <strong>Lab</strong>{" "}
            and <strong>Prescription</strong> are <strong>Yes</strong>, or <strong>Clinic note</strong> is{" "}
            <strong>Yes</strong>, at least one clinic form must be submitted for this booking before the visit can show as
            completed.
          </p>

          {triStateGroup("lab", "Lab", lab, setLab)}
          {triStateGroup("rx", "Prescription", prescription, setPrescription)}
          {triStateGroup("note", "Clinic note", clinicNote, setClinicNote)}

          <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Saving…" : "Submit"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/appointments")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
