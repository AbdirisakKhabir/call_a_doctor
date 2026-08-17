"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PrescriptionCreateForm from "@/components/prescriptions/PrescriptionCreateForm";
import { useAuth } from "@/context/AuthContext";

function positiveInt(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function NewPrescriptionPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const appointmentId = positiveInt(searchParams.get("appointmentId"));
  const patientId = positiveInt(searchParams.get("patientId"));
  const doctorId = positiveInt(searchParams.get("doctorId"));
  const branchId = positiveInt(searchParams.get("branchId"));

  const valid = appointmentId != null && patientId != null && doctorId != null && branchId != null;
  const canCreate = hasPermission("prescriptions.create");

  if (!hasPermission("prescriptions.view") && !canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New prescription" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New prescription" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to write prescriptions.
          </p>
          <Link href="/prescriptions" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Back to prescriptions
          </Link>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New prescription" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Open a calendar visit and choose <strong>Create prescription</strong>. Prescriptions are always attached to
            a booking so pharmacy and the client chart stay in sync.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            <Link href="/appointments" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Open calendar
            </Link>
            <Link href="/prescriptions" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Search prescriptions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageBreadCrumb pageTitle="Write prescription" />
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Record medicines, quantity, and how the client should take them. Pharmacy uses this list to dispense.
          </p>
        </div>
        <Link href="/prescriptions" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to prescriptions
        </Link>
      </div>
      <PrescriptionCreateForm
        appointmentId={appointmentId}
        patientId={patientId}
        doctorId={doctorId}
        branchId={branchId}
      />
    </div>
  );
}
