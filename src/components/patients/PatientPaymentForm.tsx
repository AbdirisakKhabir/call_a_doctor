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

type PatientPaymentFormProps = {
  patient: PatientPaymentTarget;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
  cancelLabel?: string;
};

export default function PatientPaymentForm({
  patient,
  onCancel,
  onSuccess,
  cancelLabel = "Cancel",
}: PatientPaymentFormProps) {
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    setAmount(
      patient.accountBalance != null && patient.accountBalance > 0
        ? String(patient.accountBalance)
        : ""
    );
    setPaymentMethodId("");
    setNotes("");
    setDiscount("");
    setError("");
  }, [patient.id, patient.accountBalance]);

  useEffect(() => {
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
  }, [patient.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cash = Number(amount);
    const disc = discount.trim() === "" ? 0 : Number(discount);
    const cashNum = Number.isFinite(cash) && cash > 0 ? cash : 0;
    const discNum = Number.isFinite(disc) && disc > 0 ? disc : 0;
    if (cashNum < 0 || discNum < 0) {
      setError("Cash and discount cannot be negative");
      return;
    }
    if (cashNum + discNum <= 0) {
      setError("Enter cash collected and/or a discount");
      return;
    }
    if (cashNum > 0 && !paymentMethodId) {
      setError("Select a payment method for cash collected");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/patients/${patient.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: cashNum,
          discount: discNum,
          paymentMethodId: cashNum > 0 ? Number(paymentMethodId) : null,
          categories: ["medication"],
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment failed");
        return;
      }
      await onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Cash collected</Label>
          <p className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">Leave 0 if applying only a discount.</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <Label>Discount</Label>
          <p className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">Write-off toward balance (no cash).</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>
      <div>
        <Label>Payment method {Number(amount) > 0 ? "*" : ""}</Label>
        <p className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
          Required when collecting cash; optional for discount-only.
        </p>
        <select
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
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
