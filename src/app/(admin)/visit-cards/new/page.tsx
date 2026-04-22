"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import ClientPhoneFields from "@/components/patients/ClientPhoneFields";
import { authFetch } from "@/lib/api";
import {
  DEFAULT_PHONE_COUNTRY_ISO2,
  formatInternationalPhoneForStorage,
  validateClientPhoneNational,
  validateOptionalClientPhoneNational,
} from "@/lib/phone-country";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";
import { PAYMENT_STATUS_OPTIONS, type PaymentStatusValue } from "@/lib/visit-card-labels";

type PatientMini = { id: number; patientCode: string; name: string; phone: string | null };
type DoctorMini = { id: number; name: string; specialty?: string | null; branch?: { id: number; name: string } | null };
type BranchMini = { id: number; name: string };
type PmMini = {
  id: number;
  name: string;
  accountBalance?: number;
  account?: { id: number; name: string; type: string; isActive: boolean };
};

type ReferralOption = { id: number; name: string };
type CityRow = { id: number; name: string };
type VillageRow = { id: number; name: string };

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    phoneNational: "",
    mobileCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    mobileNational: "",
    referralSourceId: "",
    cityId: "",
    villageId: "",
    address: "",
  });
  const [cities, setCities] = useState<CityRow[]>([]);
  const [villages, setVillages] = useState<VillageRow[]>([]);
  const [referralOptions, setReferralOptions] = useState<ReferralOption[]>([]);
  const [useNewPatient, setUseNewPatient] = useState(false);
  const [doctors, setDoctors] = useState<DoctorMini[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PmMini[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
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
    let cancelled = false;
    authFetch("/api/cities")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setCities(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cid = newPatient.cityId ? Number(newPatient.cityId) : null;
    if (!cid || !Number.isInteger(cid)) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    authFetch(`/api/villages?cityId=${cid}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setVillages(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [newPatient.cityId]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/referral-sources")
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && Array.isArray(data)) setReferralOptions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    setForm((f) => ({ ...f, doctorId: "" }));
  }, [branchId]);

  useEffect(() => {
    const bid = branchId ? Number(branchId) : null;
    if (!bid || !Number.isInteger(bid)) {
      setDoctors([]);
      return;
    }
    let cancelled = false;
    setDoctorsLoading(true);
    authFetch(`/api/doctors?branchId=${bid}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load doctors");
        const data = await r.json();
        if (!cancelled) setDoctors(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      })
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    let cancelled = false;
    setPaymentMethodsLoading(true);
    authFetch("/api/finance/payment-methods")
      .then(async (r) => {
        if (!r.ok) throw new Error("payment methods");
        const data = await r.json();
        const arr = Array.isArray(data) ? data : data.data ?? [];
        if (!cancelled) setPaymentMethods(arr as PmMini[]);
      })
      .catch(() => {
        if (!cancelled) setPaymentMethods([]);
      })
      .finally(() => {
        if (!cancelled) setPaymentMethodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      setError("Select a client or enter a new client name");
      return;
    }
    if (useNewPatient && (!newPatient.firstName.trim() || !newPatient.lastName.trim())) {
      setError("New client first and last name are required");
      return;
    }
    if (useNewPatient && (!newPatient.cityId || !newPatient.villageId)) {
      setError("City and village are required for a new client");
      return;
    }
    if (useNewPatient) {
      const phoneErr = validateClientPhoneNational(
        newPatient.phoneCountryIso2,
        newPatient.phoneNational
      );
      if (phoneErr) {
        setError(phoneErr);
        return;
      }
      const mobileErr = validateOptionalClientPhoneNational(
        newPatient.mobileCountryIso2,
        newPatient.mobileNational
      );
      if (mobileErr) {
        setError(mobileErr);
        return;
      }
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
        body.newPatient = {
          firstName: newPatient.firstName.trim(),
          lastName: newPatient.lastName.trim(),
          phone:
            formatInternationalPhoneForStorage(
              newPatient.phoneCountryIso2,
              newPatient.phoneNational
            ) ?? undefined,
          mobile:
            formatInternationalPhoneForStorage(
              newPatient.mobileCountryIso2,
              newPatient.mobileNational
            ) ?? undefined,
          registeredBranchId: bid,
          cityId: Number(newPatient.cityId),
          villageId: Number(newPatient.villageId),
          ...(newPatient.address.trim() ? { address: newPatient.address.trim() } : {}),
          ...(newPatient.referralSourceId
            ? { referralSourceId: Number(newPatient.referralSourceId) }
            : {}),
        };
      } else if (selectedPatient) {
        body.patientId = selectedPatient.id;
      }
      const res = await authFetch("/api/visit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; accountBalanceAfter?: number };
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      if (typeof data.accountBalanceAfter === "number") {
        try {
          sessionStorage.setItem(
            "visitCardDepositNotice",
            JSON.stringify({ accountBalanceAfter: data.accountBalanceAfter })
          );
        } catch {
          /* ignore quota / private mode */
        }
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
            Existing client
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input type="radio" checked={useNewPatient} onChange={() => setUseNewPatient(true)} />
            New client
          </label>
        </div>

        {!useNewPatient ? (
          <div>
            <Label>Find client</Label>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>First name *</Label>
                <input
                  required
                  value={newPatient.firstName}
                  onChange={(e) => setNewPatient((n) => ({ ...n, firstName: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <Label>Last name *</Label>
                <input
                  required
                  value={newPatient.lastName}
                  onChange={(e) => setNewPatient((n) => ({ ...n, lastName: e.target.value }))}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  autoComplete="family-name"
                />
              </div>
            </div>
            <ClientPhoneFields
              label="Phone"
              countryIso2={newPatient.phoneCountryIso2}
              national={newPatient.phoneNational}
              onCountryIso2Change={(phoneCountryIso2) =>
                setNewPatient((n) => ({ ...n, phoneCountryIso2 }))
              }
              onNationalChange={(phoneNational) => setNewPatient((n) => ({ ...n, phoneNational }))}
              nationalInputId="visit-card-new-client-phone-national"
            />
            <ClientPhoneFields
              label="Mobile (optional)"
              optionalMobile
              countryIso2={newPatient.mobileCountryIso2}
              national={newPatient.mobileNational}
              onCountryIso2Change={(mobileCountryIso2) =>
                setNewPatient((n) => ({ ...n, mobileCountryIso2 }))
              }
              onNationalChange={(mobileNational) => setNewPatient((n) => ({ ...n, mobileNational }))}
              nationalInputId="visit-card-new-client-mobile-national"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>City *</Label>
                <select
                  required
                  value={newPatient.cityId}
                  onChange={(e) =>
                    setNewPatient((n) => ({ ...n, cityId: e.target.value, villageId: "" }))
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">Select city</option>
                  {cities.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Village *</Label>
                <select
                  required
                  value={newPatient.villageId}
                  onChange={(e) => setNewPatient((n) => ({ ...n, villageId: e.target.value }))}
                  disabled={!newPatient.cityId}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">{newPatient.cityId ? "Select village" : "Select city first"}</option>
                  {villages.map((v) => (
                    <option key={v.id} value={String(v.id)}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Street / additional detail</Label>
              <input
                value={newPatient.address}
                onChange={(e) => setNewPatient((n) => ({ ...n, address: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Optional"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Registration branch matches the visit branch selected above.
            </p>
            <div>
              <Label>Referred from</Label>
              <select
                value={newPatient.referralSourceId}
                onChange={(e) => setNewPatient((n) => ({ ...n, referralSourceId: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="">— Not specified —</option>
                {referralOptions.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <Label>Doctor *</Label>
          {!branchId ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select a branch first.</p>
          ) : (
            <>
              <select
                required
                disabled={doctorsLoading}
                value={form.doctorId}
                onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-60 dark:border-gray-700 dark:text-white"
              >
                <option value="">{doctorsLoading ? "Loading doctors…" : "Select doctor"}</option>
                {!doctorsLoading &&
                  doctors.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                      {d.specialty ? ` — ${d.specialty}` : ""}
                    </option>
                  ))}
              </select>
              {!doctorsLoading && doctors.length === 0 && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400/90">
                  No doctors for this branch. Add a doctor or pick another branch.
                </p>
              )}
            </>
          )}
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

        <DateField
          id="visit-card-date"
          label="Visit date *"
          required
          value={form.visitDate}
          onChange={(v) => setForm((f) => ({ ...f, visitDate: v }))}
          appendToBody
        />

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
              disabled={paymentMethodsLoading}
              value={form.paymentMethodId}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethodId: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-60 dark:border-gray-700 dark:text-white"
            >
              <option value="">{paymentMethodsLoading ? "Loading payment methods…" : "Select payment method"}</option>
              {!paymentMethodsLoading &&
                paymentMethods.map((m) => {
                  const accName = m.account?.name ?? "Account";
                  const bal = m.accountBalance;
                  const balLabel = typeof bal === "number" ? ` — balance ${formatMoney(bal)}` : "";
                  return (
                    <option key={m.id} value={String(m.id)}>
                      {m.name} ({accName}){balLabel}
                    </option>
                  );
                })}
            </select>
            {!paymentMethodsLoading && paymentMethods.length === 0 && (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400/90">
                No active payment methods. Configure them under finance settings (requires accounts access).
              </p>
            )}
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
