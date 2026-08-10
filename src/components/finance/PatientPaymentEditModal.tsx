"use client";

import React, { useEffect, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { patientPaymentCategoryLabel } from "@/lib/patient-payment-utils";

type EditPayload = {
  id: number;
  patient: { id: number; patientCode: string; name: string; accountBalance?: number } | null;
  amount: number;
  discount: number;
  total: number;
  paymentMethodId: number | null;
  notes: string | null;
  categories: { id: number; category: string; label: string; amount: number; discount: number }[];
};

type Props = {
  paymentId: number | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

export default function PatientPaymentEditModal({ paymentId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<EditPayload | null>(null);
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!paymentId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      authFetch(`/api/finance/patient-payments/${paymentId}`),
      authFetch("/api/pharmacy/payment-methods"),
    ])
      .then(async ([payRes, pmRes]) => {
        if (cancelled) return;
        if (!payRes.ok) {
          const j = await payRes.json().catch(() => ({}));
          setError(typeof j.error === "string" ? j.error : "Could not load payment");
          setData(null);
          return;
        }
        const payload = (await payRes.json()) as EditPayload;
        setData(payload);
        setAmount(String(payload.amount ?? 0));
        setDiscount(String(payload.discount ?? 0));
        setPaymentMethodId(payload.paymentMethodId ? String(payload.paymentMethodId) : "");
        setNotes(payload.notes ?? "");
        if (pmRes.ok) {
          const list = await pmRes.json();
          setPaymentMethods(
            Array.isArray(list) ? list.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })) : []
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load payment");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  if (!paymentId) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentId) return;
    setError("");
    const cash = Number(amount);
    const disc = discount.trim() === "" ? 0 : Number(discount);
    const cashNum = Number.isFinite(cash) && cash > 0 ? cash : 0;
    const discNum = Number.isFinite(disc) && disc > 0 ? disc : 0;
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
      const res = await authFetch(`/api/finance/patient-payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: cashNum,
          discount: discNum,
          paymentMethodId: cashNum > 0 ? Number(paymentMethodId) : null,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not save changes");
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Edit payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
            {error && (
              <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                {error}
              </div>
            )}
            {data?.patient ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {data.patient.name} ({data.patient.patientCode}) — current balance:{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  ${(data.patient.accountBalance ?? 0).toFixed(2)}
                </span>
              </p>
            ) : null}
            {data?.categories && data.categories.length > 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Categories: {data.categories.map((c) => patientPaymentCategoryLabel(c.category)).join(", ")}
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Cash collected</Label>
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
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
