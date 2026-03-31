"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PAYMENT_STATUS_OPTIONS, type PaymentStatusValue } from "@/lib/visit-card-labels";

type PatientMini = { id: number; patientCode: string; name: string; phone: string | null };
type DoctorMini = { id: number; name: string };
type BranchMini = { id: number; name: string };
type PmMini = { id: number; name: string };

function NewVisitCardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { seesAllBranches, assignedBranchIds, singleAssignedBranchId } = useBranchScope();

  const canCreate = hasPermission("visit_cards.create");
  const canDeposit = hasPermission("accounts.deposit");

  const [branches, setBranches] = useState<BranchMini[]>([]);
  const [branchId, setBranchId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientHits, setPatientHits] = useState<PatientMini[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientMini | null>(null);
  const [newPatient, setNewPatient] = useState({ name: "", phone: "" });
  const [useNewPatient, setUseNewPatient] = useState(false);
  const [doctors, setDoctors] = useState<DoctorMini[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PmMini[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    doctorId: "",
    cardNumber: "",
    visitDate: new Date().toISOString().slice(0, 10),
    visitFee: "",
    paymentStatus: "unpaid" as PaymentStatusValue,
    paymentMethodId: "",
  });

  const loadBranches = useCallback(async () => {
    const res = await authFetch("/api/branches");
    if (res.ok) {
      const data = await res.json();
      setBranches(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    const q = searchParams.get("branchId");
    if (q) setBranchId(q);
    else if (!seesAllBranches && singleAssignedBranchId) {
      setBranchId(String(singleAssignedBranchId));
    }
  }, [searchParams, seesAllBranches, singleAssignedBranchId]);

  useEffect(() => {
    if (!patientSearch.trim() || patientSearch.length < 2) {
      setPatientHits([]);
      return;
    }
    const t = setTimeout(() => {
      authFetch(`/api/patients?search=${encodeURIComponent(patientSearch.trim())}&page=1&pageSize=15`)
        .then((r) => r.json())
        .then((body) => setPatientHits(body.data ?? []))
        .catch(() => setPatientHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  useEffect(() => {
    const bid = branchId ? Number(branchId) : null;
    if (!bid || !Number.isInteger(bid)) {
      setDoctors([]);
      return;
    }
    authFetch(`/api/doctors?branchId=${bid}`)
      .then((r) => r.json())
      .then((data) => setDoctors(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => setDoctors([]));
  }, [branchId]);

  useEffect(() => {
    authFetch("/api/finance/payment-methods")
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data.data ?? [];
        setPaymentMethods(arr.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })));
      })
      .catch(() => setPaymentMethods([]));
  }, []);

  const branchFilterDisabled = !seesAllBranches && Array.isArray(assignedBranchIds) && assignedBranchIds.length === 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const bid = branchId ? Number(branchId) : null;
    if (!bid || !Number.isInteger(bid)) {
      setError("Select a branch");
      return;
    }
    if (!form.cardNumber.trim()) {
      setError("Visit card number is required");
      return;
    }
    if (!form.doctorId) {
      setError("Select a doctor");
      return;
    }
    if (!useNewPatient && !selectedPatient) {
      setError("Select a patient or enter a new patient name");
      return;
    }
    if (useNewPatient && !newPatient.name.trim()) {
      setError("New patient name is required");
      return;
    }
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
        branchId: bid,
        doctorId: Number(form.doctorId),
        cardNumber: form.cardNumber.trim(),
        visitDate: form.visitDate,
        visitFee: fee,
        paymentStatus: form.paymentStatus,
      };
      if (form.paymentMethodId) body.paymentMethodId = Number(form.paymentMethodId);
      if (useNewPatient) {
        body.newPatient = { name: newPatient.name.trim(), phone: newPatient.phone.trim() || undefined };
      } else if (selectedPatient) {
        body.patientId = selectedPatient.id;
      }
      const res = await authFetch("/api/visit-cards", {
        method: "POST",
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

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New visit card" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to create visit cards.</p>
          <Link href="/visit-cards" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const showPaymentMethod = form.paymentStatus === "paid" && Number(form.visitFee || 0) > 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New visit card" />
        <Link href="/visit-cards" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          ← Back to visit cards
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3 md:p-8"
      >
        {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}

        <div>
          <Label>Branch *</Label>
          <select
            required
            disabled={branchFilterDisabled}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-6 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="radio" checked={!useNewPatient} onChange={() => setUseNewPatient(false)} />
            Existing patient
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="radio" checked={useNewPatient} onChange={() => setUseNewPatient(true)} />
            New patient
          </label>
        </div>

        {!useNewPatient ? (
          <div>
            <Label>Find patient</Label>
            <input
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Name, code, phone…"
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            {selectedPatient && (
              <p className="mt-2 text-sm text-brand-600 dark:text-brand-400">
                Selected: {selectedPatient.name} ({selectedPatient.patientCode})
              </p>
            )}
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
              {patientHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    setSelectedPatient(p);
                    setPatientSearch("");
                    setPatientHits([]);
                  }}
                >
                  {p.name} · {p.patientCode}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <input
                required
                value={newPatient.name}
                onChange={(e) => setNewPatient((n) => ({ ...n, name: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <input
                value={newPatient.phone}
                onChange={(e) => setNewPatient((n) => ({ ...n, phone: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>
        )}

        <div>
          <Label>Doctor *</Label>
          <select
            required
            value={form.doctorId}
            onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            <option value="">Select doctor</option>
            {doctors.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Visit card number *</Label>
          <input
            required
            value={form.cardNumber}
            onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            placeholder="e.g. VC-2026-001"
          />
        </div>

        <div>
          <Label>Visit date *</Label>
          <input
            type="date"
            required
            value={form.visitDate}
            onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
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

        <div>
          <Label>Payment status</Label>
          <select
            value={form.paymentStatus}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                paymentStatus: e.target.value as PaymentStatusValue,
                paymentMethodId: "",
              }))
            }
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
          >
            {PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {showPaymentMethod && (
          <div>
            <Label>Payment method *</Label>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              Records a deposit to the linked finance account and increases its balance.
            </p>
            <select
              required
              value={form.paymentMethodId}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">Select payment method</option>
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
            {submitting ? "Creating…" : "Create visit card"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewVisitCardPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      }
    >
      <NewVisitCardPage />
    </Suspense>
  );
}
