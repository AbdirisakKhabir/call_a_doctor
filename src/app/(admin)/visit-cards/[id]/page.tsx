"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  labelPaymentStatus,
  labelQueueStatus,
  paymentStatusBadgeClass,
  queueStatusBadgeClass,
} from "@/lib/visit-card-labels";

type VisitCardDetail = {
  id: number;
  cardNumber: string;
  visitDate: string;
  status: string;
  paymentStatus: string;
  visitFee: number;
  notes: string | null;
  paymentMethod: { id: number; name: string } | null;
  depositTransaction: { id: number; amount: number } | null;
  patient: { name: string; patientCode: string; phone: string | null };
  doctor: { id: number; name: string };
  branch: { name: string };
};

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export default function VisitCardViewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id ? Number(params.id) : NaN;
  const { hasPermission, user } = useAuth();

  const canView =
    hasPermission("visit_cards.view_all") ||
    hasPermission("visit_cards.view_own") ||
    hasPermission("visit_cards.create");
  const canEdit = hasPermission("visit_cards.edit");

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<VisitCardDetail | null>(null);
  const [error, setError] = useState("");
  const [completeStep, setCompleteStep] = useState<"idle" | "confirm">("idle");
  const [completing, setCompleting] = useState(false);

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
        setCard(data as VisitCardDetail);
        setError("");
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  const canMarkCompleteUi =
    card &&
    (canEdit ||
      (hasPermission("visit_cards.view_own") &&
        user?.doctorId != null &&
        user.doctorId === card.doctor.id)) &&
    card.status !== "completed" &&
    card.status !== "cancelled";

  async function confirmComplete() {
    if (!Number.isInteger(id)) return;
    setCompleting(true);
    setError("");
    try {
      const res = await authFetch(`/api/visit-cards/${id}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not update");
        return;
      }
      setCard(data as VisitCardDetail);
      setCompleteStep("idle");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setCompleting(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Visit card" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to view visit cards.</p>
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
        <PageBreadCrumb pageTitle="Visit card" />
        <p className="mt-6 text-sm text-gray-500">Invalid visit card.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Visit card" />
        <div className="flex flex-wrap gap-3">
          <Link href="/visit-cards" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            ← Visit cards
          </Link>
          {canEdit && card && (
            <Link
              href={`/visit-cards/${card.id}/edit`}
              className="text-sm font-medium text-gray-700 hover:underline dark:text-gray-300"
            >
              Edit details
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      ) : error && !card ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          <Link href="/visit-cards" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Back to list
          </Link>
        </div>
      ) : card ? (
        <div className="mx-auto max-w-2xl space-y-6">
          {error ? <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div> : null}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4 dark:border-gray-800">
              <div>
                <p className="font-mono text-lg font-semibold text-brand-600 dark:text-brand-400">{card.cardNumber}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{card.branch.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${queueStatusBadgeClass(card.status)}`}>
                  Visit: {labelQueueStatus(card.status)}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentStatusBadgeClass(card.paymentStatus)}`}>
                  Payment: {labelPaymentStatus(card.paymentStatus)}
                </span>
              </div>
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Patient</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {card.patient.name}{" "}
                  <span className="font-normal text-gray-500 dark:text-gray-400">({card.patient.patientCode})</span>
                </dd>
                {card.patient.phone ? (
                  <dd className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{card.patient.phone}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Doctor</dt>
                <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{card.doctor.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Visit date</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(card.visitDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Visit fee</dt>
                <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">${card.visitFee.toFixed(2)}</dd>
              </div>
              {card.paymentMethod ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Payment method</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{card.paymentMethod.name}</dd>
                </div>
              ) : null}
              {card.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{card.notes}</dd>
                </div>
              ) : null}
            </dl>

            {card.depositTransaction ? (
              <p className="mt-6 text-xs font-medium text-emerald-600 dark:text-emerald-400">Ledger deposit recorded for this visit.</p>
            ) : null}
          </div>

          {card.status === "completed" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
              This visit is marked <strong>completed</strong>.
            </div>
          )}

          {card.status === "cancelled" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
              This visit card is cancelled.
            </div>
          )}

          {canMarkCompleteUi && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-6 dark:border-brand-500/25 dark:bg-brand-500/5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Complete visit</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                When the consultation is finished, mark this visit as completed. This only updates the visit status (queue).
              </p>

              {completeStep === "idle" ? (
                <Button type="button" size="sm" className="mt-4" onClick={() => setCompleteStep("confirm")}>
                  Mark visit as completed
                </Button>
              ) : (
                <div className="mt-4 space-y-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Mark this visit as completed?</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={completing}
                      onClick={() => setCompleteStep("idle")}
                    >
                      No
                    </Button>
                    <Button type="button" size="sm" disabled={completing} onClick={() => void confirmComplete()}>
                      {completing ? "Updating…" : "Yes, complete"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
