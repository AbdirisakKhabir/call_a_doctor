"use client";

import React from "react";
import PatientPaymentForm, { type PatientPaymentTarget } from "@/components/patients/PatientPaymentForm";

export type { PatientPaymentTarget };

type PatientPaymentModalProps = {
  patient: PatientPaymentTarget | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  /** Inline card for /payments/new (no fullscreen overlay). */
  embedded?: boolean;
};

export default function PatientPaymentModal({
  patient,
  onClose,
  onSuccess,
  embedded = false,
}: PatientPaymentModalProps) {
  if (!patient) return null;

  const shellClass = embedded
    ? "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3"
    : "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900";

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold">Record payment</h2>
        {embedded ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Change client
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ×
          </button>
        )}
      </div>
      <div className="px-6 py-5">
        <PatientPaymentForm
          patient={patient}
          onCancel={onClose}
          onSuccess={async () => {
            if (!embedded) onClose();
            await onSuccess();
          }}
          cancelLabel={embedded ? "Change client" : "Cancel"}
        />
      </div>
    </>
  );

  if (embedded) {
    return <div className={shellClass}>{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={shellClass}>{content}</div>
    </div>
  );
}
