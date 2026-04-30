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

type PaymentCategory = "medication" | "prescription" | "pharmacy_credit" | "laboratory";

const CATEGORY_OPTIONS: { value: PaymentCategory; label: string }[] = [
  { value: "medication", label: "Appointment fee" },
  { value: "prescription", label: "Prescription" },
  { value: "pharmacy_credit", label: "Pharmacy credits" },
  { value: "laboratory", label: "Laboratory (lab fee)" },
];

const defaultCategories = (): Set<PaymentCategory> => new Set(["medication"]);

function sortedSelectedCategories(set: Set<PaymentCategory>): PaymentCategory[] {
  return CATEGORY_OPTIONS.map((o) => o.value).filter((v) => set.has(v));
}

function togglePaymentCategory(
  set: Set<PaymentCategory>,
  value: PaymentCategory
): Set<PaymentCategory> {
  if (value === "laboratory") {
    return new Set(["laboratory"]);
  }
  const next = new Set(set);
  next.delete("laboratory");
  if (next.has(value)) {
    next.delete(value);
    if (next.size === 0) next.add("medication");
  } else {
    next.add(value);
  }
  return next;
}

type PendingLabOrder = {
  id: number;
  totalAmount: number;
  feeRemaining: number;
  feeSettled: boolean;
  doctor: { id: number; name: string };
  createdAt: string;
};

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
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [categorySet, setCategorySet] = useState<Set<PaymentCategory>>(defaultCategories);
  const [labOrderId, setLabOrderId] = useState("");
  const [pendingLabOrders, setPendingLabOrders] = useState<PendingLabOrder[]>([]);
  const [loadingLabOrders, setLoadingLabOrders] = useState(false);
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
    setCategorySet(defaultCategories());
    setDiscount("");
    setLabOrderId("");
    setPendingLabOrders([]);
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

  const categoriesKey = [...categorySet].sort().join(",");

  useEffect(() => {
    if (!patient || categoriesKey !== "laboratory") return;
    let cancelled = false;
    setLoadingLabOrders(true);
    authFetch(`/api/patients/${patient.id}/lab-orders?pendingFee=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? (data as PendingLabOrder[]) : [];
        setPendingLabOrders(list);
        const first = list[0];
        setLabOrderId((prev) => {
          if (prev && list.some((o) => String(o.id) === prev)) return prev;
          return first ? String(first.id) : "";
        });
        if (first) {
          const bal = patient.accountBalance ?? 0;
          const apply = Math.min(bal, first.feeRemaining);
          setAmount(apply > 0 ? String(apply) : "");
          setDiscount("");
        }
      })
      .catch(() => {
        if (!cancelled) setPendingLabOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLabOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patient?.id, categoriesKey, patient?.accountBalance]);

  if (!patient) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient) return;
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
    const categories = sortedSelectedCategories(categorySet);
    if (categories.length === 0) {
      setError("Choose at least one payment type");
      return;
    }
    if (categories.includes("laboratory") && !labOrderId) {
      setError("Select a lab order with an unpaid fee");
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
          categories,
          labOrderId: categories.includes("laboratory") ? Number(labOrderId) : undefined,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment failed");
        return;
      }

      if (!embedded) onClose();
      await onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const shellClass = embedded
    ? "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3"
    : "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900";

  const header = (
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
  );

  const formBody = (
    <>
      {header}
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
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment for *</legend>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select one or more. Laboratory cannot be combined with other types.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {CATEGORY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  categorySet.has(opt.value)
                    ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/15"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={categorySet.has(opt.value)}
                  onChange={() => setCategorySet((prev) => togglePaymentCategory(prev, opt.value))}
                  className="rounded border-gray-300 text-brand-600"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {categorySet.has("laboratory") && categoriesKey === "laboratory" && (
          <>
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
              Choose the lab requisition this payment settles.
            </div>
            <div>
              <Label>Lab order *</Label>
              {loadingLabOrders ? (
                <p className="mt-1 text-sm text-gray-500">Loading open lab orders…</p>
              ) : pendingLabOrders.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  No unpaid lab fees. Refresh or check lab orders.
                </p>
              ) : (
                <select
                  required
                  value={labOrderId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setLabOrderId(id);
                    const o = pendingLabOrders.find((x) => String(x.id) === id);
                    if (o) {
                      const bal = patient.accountBalance ?? 0;
                      const apply = Math.min(bal, o.feeRemaining);
                      setAmount(apply > 0 ? String(apply) : "");
                    }
                  }}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {pendingLabOrders.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      Order #{o.id} — {o.doctor.name} — remaining ${o.feeRemaining.toFixed(2)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

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
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {embedded ? "Change client" : "Cancel"}
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </>
  );

  if (embedded) {
    return <div className={shellClass}>{formBody}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={shellClass}>{formBody}</div>
    </div>
  );
}
