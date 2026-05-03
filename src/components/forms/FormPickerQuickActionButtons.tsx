"use client";

import Link from "next/link";
import { FlaskConical, Pill } from "lucide-react";

type Props = {
  patientId: number;
  appointmentId: number | null;
  doctorId: number | null;
  branchId: number | null;
  showLab: boolean;
  showPrescription: boolean;
};

/**
 * Lab + Prescription shortcuts shown above the published-forms list in “Choose a form” modals.
 */
export default function FormPickerQuickActionButtons({
  patientId,
  appointmentId,
  doctorId,
  branchId,
  showLab,
  showPrescription,
}: Props) {
  const hasBooking =
    appointmentId != null &&
    appointmentId > 0 &&
    doctorId != null &&
    doctorId > 0 &&
    branchId != null &&
    branchId > 0;

  const labHref = hasBooking
    ? `/lab/orders/new?appointmentId=${appointmentId}&patientId=${patientId}&doctorId=${doctorId}`
    : `/appointments/new?patientId=${patientId}`;
  const rxHref = hasBooking
    ? `/prescriptions?create=1&appointmentId=${appointmentId}&patientId=${patientId}&doctorId=${doctorId}&branchId=${branchId}`
    : `/appointments/new?patientId=${patientId}`;

  if (!showLab && !showPrescription) return null;

  return (
    <div className="mt-4 space-y-3">
      {!hasBooking ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100/90">
          No visit on file to attach yet. These buttons open <strong>New booking</strong> with this client; after you
          schedule, use lab or prescription from the visit.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showLab ? (
          <Link
            href={labHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:bg-violet-500 dark:shadow-violet-900/40 dark:hover:bg-violet-400 dark:focus-visible:ring-offset-gray-900"
          >
            <FlaskConical className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            Lab request
          </Link>
        ) : null}
        {showPrescription ? (
          <Link
            href={rxHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-500 dark:shadow-emerald-900/40 dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-gray-900"
          >
            <Pill className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            Prescription
          </Link>
        ) : null}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Or choose a clinic form
      </p>
    </div>
  );
}
