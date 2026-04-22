"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import LabOrderCreateForm from "@/components/lab/LabOrderCreateForm";
import { useAuth } from "@/context/AuthContext";

export default function NewLabOrderPage() {
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const appointmentId = Number(searchParams.get("appointmentId"));
  const patientId = Number(searchParams.get("patientId"));
  const doctorId = Number(searchParams.get("doctorId"));

  const valid =
    Number.isInteger(appointmentId) &&
    appointmentId > 0 &&
    Number.isInteger(patientId) &&
    patientId > 0 &&
    Number.isInteger(doctorId) &&
    doctorId > 0;

  const canCreate = hasPermission("lab.create");

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab order" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission.</p>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab order" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">You do not have permission to create lab orders.</p>
          <Link href="/lab/orders" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Back to lab orders
          </Link>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New lab order" />
        <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Missing booking context. Use <strong>Send to Lab</strong> from a booking, or add{" "}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">appointmentId</code>,{" "}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">patientId</code>,{" "}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">doctorId</code> to the URL.
          </p>
          <Link href="/lab/orders" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Back to lab orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New lab order" />
        <Link href="/lab/orders" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to lab orders
        </Link>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Booking #{appointmentId} · Client #{patientId} · Doctor #{doctorId}
      </p>
      <LabOrderCreateForm appointmentId={appointmentId} patientId={patientId} doctorId={doctorId} />
    </div>
  );
}
