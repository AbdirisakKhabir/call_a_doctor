"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ClinicFormsPageContent from "@/components/appointments/ClinicFormsPageContent";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type AppointmentHeader = {
  id: number;
  patient: { id: number; name: string; patientCode: string };
};

export default function AppointmentClinicFormsPage() {
  const params = useParams();
  const rawId = params?.id;
  const appointmentId =
    typeof rawId === "string" ? Number(rawId) : Array.isArray(rawId) ? Number(rawId[0]) : NaN;

  const { hasPermission } = useAuth();
  const allowed =
    hasPermission("patient_history.create") ||
    hasPermission("patient_history.view") ||
    hasPermission("forms.view");

  const [appt, setAppt] = useState<AppointmentHeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!allowed || !Number.isInteger(appointmentId) || appointmentId < 1) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    authFetch(`/api/appointments/${appointmentId}`)
      .then(async (res) => {
        const data = (await res.json()) as AppointmentHeader & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Could not load booking");
          setAppt(null);
          return;
        }
        setAppt({
          id: data.id,
          patient: data.patient,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, appointmentId]);

  if (!Number.isInteger(appointmentId) || appointmentId < 1) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">Invalid booking.</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
        <Link
          href={`/appointments/${appointmentId}`}
          className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400"
        >
          ← Back to booking
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

  if (error || !appt) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Clinic note — forms" />
        <p className="mt-6 text-sm text-error-600 dark:text-error-400">{error || "Booking not found."}</p>
        <Link
          href={`/appointments/${appointmentId}`}
          className="mt-4 inline-block text-sm font-medium text-brand-600 dark:text-brand-400"
        >
          ← Back to booking
        </Link>
      </div>
    );
  }

  return (
    <ClinicFormsPageContent
      appointmentId={appt.id}
      patientId={appt.patient.id}
      patientLabel={`${appt.patient.name} (${appt.patient.patientCode})`}
    />
  );
}
