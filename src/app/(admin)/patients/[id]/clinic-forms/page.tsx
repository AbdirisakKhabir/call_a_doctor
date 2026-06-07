"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ClinicFormsPageContent from "@/components/appointments/ClinicFormsPageContent";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type PatientHeader = {
  id: number;
  name: string;
  patientCode: string;
};

export default function PatientClinicFormsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params?.id;
  const patientId =
    typeof rawId === "string" ? Number(rawId) : Array.isArray(rawId) ? Number(rawId[0]) : NaN;

  const formIdRaw = searchParams.get("formId");
  const initialFormId =
    formIdRaw && /^\d+$/.test(formIdRaw) ? Number.parseInt(formIdRaw, 10) : null;

  const { hasPermission } = useAuth();
  const allowed =
    hasPermission("patient_history.create") ||
    hasPermission("patient_history.view") ||
    hasPermission("forms.view");

  const [patient, setPatient] = useState<PatientHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!allowed || !Number.isInteger(patientId) || patientId < 1) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch(`/api/patients/${patientId}`)
      .then(async (res) => {
        const data = (await res.json()) as PatientHeader & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Could not load client");
          setPatient(null);
          return;
        }
        setPatient({
          id: data.id,
          name: data.name,
          patientCode: data.patientCode,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, patientId]);

  if (!Number.isInteger(patientId) || patientId < 1) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">Invalid client.</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        <Link
          href={`/patients/${patientId}/history`}
          className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400"
        >
          ← Back to client history
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-error-600 dark:text-error-400">{error || "Client not found."}</p>
        <Link
          href="/patients"
          className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400"
        >
          ← Back to clients
        </Link>
      </div>
    );
  }

  return (
    <ClinicFormsPageContent
      appointmentId={null}
      patientId={patient.id}
      patientLabel={`${patient.name} (${patient.patientCode})`}
      initialFormId={initialFormId && initialFormId > 0 ? initialFormId : null}
    />
  );
}
