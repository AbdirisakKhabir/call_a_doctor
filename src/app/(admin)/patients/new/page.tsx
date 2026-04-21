"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import AgeReadonlyInput from "@/components/form/AgeReadonlyInput";
import ClientFormCard from "@/components/patients/ClientFormCard";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

type ReferralOption = { id: number; name: string };
type CityOpt = { id: number; name: string };
type VillageOpt = { id: number; name: string };
type BranchOpt = { id: number; name: string };

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  cityId: "",
  villageId: "",
  registeredBranchId: "",
  notes: "",
  referralSourceId: "",
};

function appointmentReturnHref(apptDate: string | null): string {
  const qs = new URLSearchParams();
  if (apptDate && /^\d{4}-\d{2}-\d{2}$/.test(apptDate)) qs.set("date", apptDate);
  const q = qs.toString();
  return q ? `/appointments/new?${q}` : "/appointments/new";
}

export default function NewPatientPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnNext = searchParams.get("next");
  const apptDateParam = searchParams.get("apptDate");
  const returnToNewAppointment = returnNext === "/appointments/new";
  const { hasPermission, user, isLoading: authLoading } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const canCreate = hasPermission("patients.create") || hasPermission("pharmacy.create");
  const canAllBranches = hasPermission("settings.manage");

  const [referralOptions, setReferralOptions] = useState<ReferralOption[]>([]);
  const [cities, setCities] = useState<CityOpt[]>([]);
  const [villages, setVillages] = useState<VillageOpt[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    if (authLoading) return;
    const url = canAllBranches ? "/api/branches?all=true" : "/api/branches";
    let cancelled = false;
    authFetch(url)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        const list = Array.isArray(data) ? data : data.data ?? [];
        if (!cancelled) setBranches(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canAllBranches, authLoading, user?.id]);

  useEffect(() => {
    const cid = form.cityId ? Number(form.cityId) : null;
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
  }, [form.cityId]);

  useEffect(() => {
    if (!singleAssignedBranchId) return;
    setForm((f) =>
      f.registeredBranchId ? f : { ...f, registeredBranchId: String(singleAssignedBranchId) }
    );
  }, [singleAssignedBranchId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        referralSourceId: form.referralSourceId ? Number(form.referralSourceId) : null,
        cityId: form.cityId ? Number(form.cityId) : null,
        villageId: form.villageId ? Number(form.villageId) : null,
        registeredBranchId: form.registeredBranchId ? Number(form.registeredBranchId) : null,
      };
      const res = await authFetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
        return;
      }
      if (returnToNewAppointment && data && typeof data.id === "number") {
        const qs = new URLSearchParams();
        qs.set("patientId", String(data.id));
        if (apptDateParam && /^\d{4}-\d{2}-\d{2}$/.test(apptDateParam)) qs.set("date", apptDateParam);
        router.push(`/appointments/new?${qs.toString()}`);
        router.refresh();
        return;
      }
      router.push(`/patients`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Add client" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have permission to add clients.</p>
          <Link href="/patients" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Add client" />
        <Link
          href={returnToNewAppointment ? appointmentReturnHref(apptDateParam) : "/patients"}
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {returnToNewAppointment ? "← Back to new appointment" : "← Back to clients"}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        {error && (
          <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </div>
        )}

        <ClientFormCard
          title="Registration branch"
          description="Where this client was first registered."
        >
          <div>
            <Label>Branch *</Label>
            <select
              required
              autoFocus
              value={form.registeredBranchId}
              onChange={(e) => setForm((f) => ({ ...f, registeredBranchId: e.target.value }))}
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
        </ClientFormCard>

        <ClientFormCard title="Personal information" description="Legal name, demographics, and date of birth.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>First name *</Label>
              <input
                required
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                placeholder="First name"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label>Last name *</Label>
              <input
                required
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                placeholder="Last name"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-5">
              <DateField
                id="new-patient-dob"
                label="Date of birth"
                value={form.dateOfBirth}
                onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                appendToBody
              />
            </div>
            <div className="lg:col-span-3">
              <AgeReadonlyInput dateOfBirth={form.dateOfBirth} idSuffix="new" />
            </div>
            <div className="lg:col-span-4">
              <Label>Gender</Label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
        </ClientFormCard>

        <ClientFormCard
          title="Address"
          description="City and village define locality; add street detail if needed."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>City *</Label>
              <select
                required
                value={form.cityId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cityId: e.target.value, villageId: "" }))
                }
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
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
                value={form.villageId}
                onChange={(e) => setForm((f) => ({ ...f, villageId: e.target.value }))}
                disabled={!form.cityId}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm disabled:opacity-50 dark:border-gray-700 dark:text-white"
              >
                <option value="">{form.cityId ? "Select village" : "Select city first"}</option>
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
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              placeholder="Optional — building, street…"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Configure cities and villages under Settings → Cities & villages.
            </p>
          </div>
        </ClientFormCard>

        <ClientFormCard title="Contact details" description="How we reach the client.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                placeholder="+1234567890"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label>Email</Label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
                placeholder="email@example.com"
                autoComplete="email"
              />
            </div>
          </div>
        </ClientFormCard>

        <ClientFormCard title="Referral & chart" description="Optional referral source and clinical alerts on file.">
          <div>
            <Label>Referred from</Label>
            <select
              value={form.referralSourceId}
              onChange={(e) => setForm((f) => ({ ...f, referralSourceId: e.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              <option value="">— Not specified —</option>
              {referralOptions.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Configure options under Settings → Referred from.</p>
          </div>
          <div>
            <Label>Client chart notes (alerts / allergies)</Label>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Shown when booking and prescribing.</p>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              placeholder="Allergies, warnings, demographics…"
            />
          </div>
        </ClientFormCard>

        <div className="flex flex-col-reverse gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-4 dark:border-gray-800 dark:bg-gray-900/30 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() =>
              router.push(returnToNewAppointment ? appointmentReturnHref(apptDateParam) : "/patients")
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} size="sm" className="w-full sm:w-auto">
            {submitting ? "Creating…" : "Create client"}
          </Button>
        </div>
      </form>
    </div>
  );
}
