"use client";

import React, { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import type { PatientPaymentDue, PaymentDueBucket } from "@/lib/patient-payment-due";

export type PatientPaymentTarget = {
  id: number;
  patientCode: string;
  name: string;
  accountBalance?: number;
};

type LineState = {
  cash: string;
  discount: string;
};

type PatientPaymentFormProps = {
  patient: PatientPaymentTarget;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
  cancelLabel?: string;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function PatientPaymentForm({
  patient,
  onCancel,
  onSuccess,
  cancelLabel = "Cancel",
}: PatientPaymentFormProps) {
  const [due, setDue] = useState<PatientPaymentDue | null>(null);
  const [dueLoading, setDueLoading] = useState(true);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setDueLoading(true);
    setError("");
    authFetch(`/api/patients/${patient.id}/payment-due`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PatientPaymentDue | null) => {
        if (cancelled) return;
        setDue(data);
        const next: Record<string, LineState> = {};
        for (const b of data?.buckets ?? []) {
          next[b.category] = {
            cash: b.due > 0 ? String(b.due) : "",
            discount: "",
          };
        }
        setLines(next);
        setPaymentMethodId("");
        setNotes("");
      })
      .catch(() => {
        if (!cancelled) setDue(null);
      })
      .finally(() => {
        if (!cancelled) setDueLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const buckets = due?.buckets ?? [];
  const serviceBuckets = buckets.filter((b) => b.section === "services");
  const creditBuckets = buckets.filter((b) => b.section === "credit");

  const totals = useMemo(() => {
    let cash = 0;
    let discount = 0;
    for (const b of buckets) {
      const row = lines[b.category];
      const c = Number(row?.cash ?? "");
      const d = Number(row?.discount ?? "");
      if (Number.isFinite(c) && c > 0) cash += c;
      if (Number.isFinite(d) && d > 0) discount += d;
    }
    return { cash, discount, applied: cash + discount };
  }, [buckets, lines]);

  function setLine(category: string, field: keyof LineState, value: string) {
    setLines((prev) => ({
      ...prev,
      [category]: {
        cash: prev[category]?.cash ?? "",
        discount: prev[category]?.discount ?? "",
        [field]: value,
      },
    }));
  }

  function fillSuggested() {
    const next: Record<string, LineState> = {};
    for (const b of buckets) {
      next[b.category] = { cash: b.due > 0 ? String(b.due) : "", discount: "" };
    }
    setLines(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const allocations = buckets
      .map((b) => {
        const row = lines[b.category];
        const cash = Number(row?.cash ?? "");
        const disc = Number(row?.discount ?? "");
        const amount = Number.isFinite(cash) && cash > 0 ? cash : 0;
        const discount = Number.isFinite(disc) && disc > 0 ? disc : 0;
        return { category: b.category, amount, discount };
      })
      .filter((a) => a.amount + a.discount > 0);

    if (allocations.length === 0) {
      setError("Enter an amount on at least one line (lab, calendar, prescriptions, or credit).");
      return;
    }
    if (allocations.some((a) => a.amount < 0 || a.discount < 0)) {
      setError("Amounts cannot be negative");
      return;
    }
    const cashTotal = allocations.reduce((s, a) => s + a.amount, 0);
    if (cashTotal > 0 && !paymentMethodId) {
      setError("Select a payment method for cash collected");
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/patients/${patient.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations,
          paymentMethodId: cashTotal > 0 ? Number(paymentMethodId) : null,
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

  const balance = due?.accountBalance ?? patient.accountBalance ?? 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {patient.name} ({patient.patientCode}) — balance due:{" "}
        <span className="font-semibold text-gray-900 dark:text-white">{money(balance)}</span>
      </p>
      {due && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Services {money(due.servicesDue)} · Credit {money(due.creditDue)}. Enter cash (and optional discount)
          on each line you are collecting now.
        </p>
      )}

      {dueLoading ? (
        <p className="text-sm text-gray-500">Loading amounts due…</p>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Services</h4>
              <button
                type="button"
                onClick={fillSuggested}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Fill amounts due
              </button>
            </div>
            <div className="space-y-4">
              {serviceBuckets.map((b) => (
                <AmountLine
                  key={b.category}
                  bucket={b}
                  line={lines[b.category]}
                  onChange={setLine}
                  extra={
                    b.category === "laboratory" && due && due.labOrders.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                        {due.labOrders.map((o) => (
                          <li key={o.id}>
                            Lab #{o.id}
                            {o.doctorName ? ` · ${o.doctorName}` : ""} — remaining {money(o.remaining)}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Credit</h4>
            <div className="space-y-4">
              {creditBuckets.map((b) => (
                <AmountLine
                  key={b.category}
                  bucket={b}
                  line={lines[b.category]}
                  onChange={setLine}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-white/5">
        <p className="text-gray-700 dark:text-gray-200">
          Cash collected: <span className="font-mono font-medium tabular-nums">{money(totals.cash)}</span>
          {" · "}
          Discount: <span className="font-mono font-medium tabular-nums">{money(totals.discount)}</span>
          {" · "}
          Applied: <span className="font-mono font-semibold tabular-nums">{money(totals.applied)}</span>
        </p>
      </div>

      <div>
        <Label>Payment method {totals.cash > 0 ? "*" : ""}</Label>
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
        <Button type="submit" size="sm" disabled={submitting || dueLoading}>
          {submitting ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

function AmountLine({
  bucket,
  line,
  onChange,
  extra,
}: {
  bucket: PaymentDueBucket;
  line?: LineState;
  onChange: (category: string, field: keyof LineState, value: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <Label className="mb-0">{bucket.label}</Label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Due {money(bucket.due)}
        </span>
      </div>
      {extra}
      <div className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[11px] text-gray-500">Cash</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={line?.cash ?? ""}
            onChange={(e) => onChange(bucket.category, "cash", e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-gray-500">Discount</p>
          <input
            type="number"
            step="0.01"
            min="0"
            value={line?.discount ?? ""}
            onChange={(e) => onChange(bucket.category, "discount", e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
}
