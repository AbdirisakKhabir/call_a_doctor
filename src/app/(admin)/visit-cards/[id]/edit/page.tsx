"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  PAYMENT_STATUS_OPTIONS,
  QUEUE_STATUS_OPTIONS,
  type PaymentStatusValue,
  type QueueStatusValue,
} from "@/lib/visit-card-labels";

type PmMini = { id: number; name: string };

type VisitCardDetail = {
  id: number;
  cardNumber: string;
  visitDate: string;
  status: string;
  paymentStatus: string;
  visitFee: number;
  paymentMethod: PmMini | null;
  depositTransaction: { id: number } | null;
  patient: { name: string; patientCode: string };
  doctor: { name: string };
  branch: { name: string };
};

export default function EditVisitCardPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id ? Number(params.id) : NaN;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("visit_cards.edit");
  const canDeposit = hasPermission("accounts.deposit");

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<VisitCardDetail | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PmMini[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    status: "inWaiting" as QueueStatusValue,
    paymentStatus: "unpaid" as PaymentStatusValue,
    visitFee: "",
    paymentMethodId: "",
  });

  useEffect(() => {
    if (!Number.isInteger(id)) return;
    setLoading(true);
    authFetch(`/api/visit-cards/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setCard(null);
          setError(data.error);
          return;
        }
        const c = data as VisitCardDetail;
        setCard(c);
        setForm({
          status: c.status as QueueStatusValue,
          paymentStatus: c.paymentStatus as PaymentStatusValue,
          visitFee: String(c.visitFee),
          paymentMethodId: c.paymentMethod ? String(c.paymentMethod.id) : "",
        });
        setError("");
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    authFetch("/api/finance/payment-methods")
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data.data ?? [];
        setPaymentMethods(arr.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })));
      })
      .catch(() => setPaymentMethods([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(id)) return;
    setError("");
    const fee = form.visitFee === "" ? 0 : Number(form.visitFee);
    if (form.paymentStatus === "paid" && fee > 0 && !form.paymentMethodId) {
      setError("Select a payment method for a paid visit with a fee");
      return;
    }
    if (form.paymentStatus === "paid" && fee > 0 && !canDeposit) {
      setError("Your role needs accounts.deposit permission to record a paid visit with a fee");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        status: form.status,
        paymentStatus: form.paymentStatus,
        visitFee: fee,
      };
      if (form.paymentMethodId) {
        body.paymentMethodId = Number(form.paymentMethodId);
      } else {
        body.paymentMethodId = null;
      }
      const res = await authFetch(`/api/visit-cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.push("/visit-cards");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!canEdit) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit visit card" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit visit cards.</p>
          <Link href="/visit-cards" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  if (!Number.isInteger(id)) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit visit card" />
        <p className="mt-6 text-sm text-gray-500">Invalid visit card.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (!card) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Edit visit card" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{error || "Visit card not found."}</p>
          <Link href="/visit-cards" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const showPaymentMethod = form.paymentStatus === "paid" && Number(form.visitFee || 0) > 0;
  const depositLocked = !!card.depositTransaction;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle={`Edit · ${card.cardNumber}`} />
        <Link href="/visit-cards" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to visit cards
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm dark:border-gray-800 dark:bg-gray-900/40">
        <p>
          <span className="text-gray-500 dark:text-gray-400">Client: </span>
          <span className="font-medium text-gray-900 dark:text-white">{card.patient.name}</span> ({card.patient.patientCode})
        </p>
        <p className="mt-1">
          <span className="text-gray-500 dark:text-gray-400">Doctor: </span>
          {card.doctor.name} · {card.branch.name}
        </p>
        {depositLocked && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            A ledger deposit is linked. Payment status cannot be changed away from Paid until an admin resolves it.
          </p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-8"
      >
        {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}

        <div>
          <Label>Queue status</Label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as QueueStatusValue }))}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            {QUEUE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Payment status</Label>
          <select
            value={form.paymentStatus}
            disabled={depositLocked}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                paymentStatus: e.target.value as PaymentStatusValue,
                paymentMethodId: "",
              }))
            }
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white disabled:opacity-60"
          >
            {PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Visit fee</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.visitFee}
            onChange={(e) => setForm((f) => ({ ...f, visitFee: e.target.value }))}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>

        {showPaymentMethod && (
          <div>
            <Label>
              Payment method
              {` (ledger deposit${canDeposit ? "" : " — requires accounts.deposit"})`}
            </Label>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              Choosing a method records a deposit to the linked finance account when you save (if not already deposited).
            </p>
            <select
              value={form.paymentMethodId}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">—</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-800">
          <Button type="button" variant="outline" size="sm" onClick={() => router.push("/visit-cards")}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
