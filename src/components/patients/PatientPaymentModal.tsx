"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";

export type PatientPaymentTarget = {
  id: number;
  patientCode: string;
  name: string;
  accountBalance?: number;
};

type PaymentCategory = "medication" | "prescription" | "pharmacy_credit";

const CATEGORY_OPTIONS: { value: PaymentCategory; label: string }[] = [
  { value: "medication", label: "Medication" },
  { value: "prescription", label: "Prescription" },
  { value: "pharmacy_credit", label: "Pharmacy credits" },
];

type PatientPaymentModalProps = {
  patient: PatientPaymentTarget | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

export default function PatientPaymentModal({
  patient,
  onClose,
  onSuccess,
}: PatientPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<PaymentCategory>("medication");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!patient) return;
    setAmount(
      patient.accountBalance != null && patient.accountBalance > 0
        ? String(patient.accountBalance)
        : ""
    );
    setPaymentMethodId("");
    setNotes("");
    setCategory("medication");
    setError("");
  }, [patient?.id]);

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    (async () => {
      const res = await authFetch("/api/pharmacy/payment-methods");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (cancelled) return;
      setPaymentMethods(
        Array.isArray(data)
          ? data.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name }))
          : []
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [patient?.id]);

  if (!patient) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) return;
    setError("");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!paymentMethodId) {
      setError("Select a payment method");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/patients/${patient.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          paymentMethodId: Number(paymentMethodId),
          category,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment failed");
        return;
      }
      onClose();
      await onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Record payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
              {error}
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {patient.name} ({patient.patientCode}) — balance due:{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              ${(patient.accountBalance ?? 0).toFixed(2)}
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Payment reduces the patient account balance. Choose what this payment is for (reporting); amounts over the
            balance are capped to the balance due.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment for *</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    category === opt.value
                      ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/15"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentCategory"
                    value={opt.value}
                    checked={category === opt.value}
                    onChange={() => setCategory(opt.value)}
                    className="border-gray-300 text-brand-600"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Label>Amount *</Label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <Label>Payment method *</Label>
            <select
              required
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select…</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
