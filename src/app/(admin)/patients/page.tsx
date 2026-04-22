"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Label from "@/components/form/Label";
import DateOfBirthSplitFields from "@/components/form/DateOfBirthSplitFields";
import AgeReadonlyInput from "@/components/form/AgeReadonlyInput";
import ClientFormCard from "@/components/patients/ClientFormCard";
import ClientPhoneFields from "@/components/patients/ClientPhoneFields";
import { authFetch } from "@/lib/api";
import {
  DEFAULT_PHONE_COUNTRY_ISO2,
  formatInternationalPhoneForStorage,
  parseStoredPhoneIntoParts,
  validateClientPhoneNational,
  validateOptionalClientPhoneNational,
} from "@/lib/phone-country";
import { useAuth } from "@/context/AuthContext";
import { HorizontaLDots, PlusIcon } from "@/icons";
import PatientPaymentModal from "@/components/patients/PatientPaymentModal";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";
import { calculateAgeFromIsoDateString } from "@/lib/age-from-dob";

type Patient = {
  id: number;
  patientCode: string;
  firstName: string;
  lastName: string;
  /** Display full name (from API). */
  name: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  notes: string | null;
  referralSourceId?: number | null;
  referralSource?: { id: number; name: string } | null;
  city?: { id: number; name: string } | null;
  village?: { id: number; name: string } | null;
  registeredBranch?: { id: number; name: string } | null;
  cityId?: number | null;
  villageId?: number | null;
  registeredBranchId?: number | null;
  /** Persisted full years (recalculated when DOB is saved). */
  age?: number | null;
  accountBalance?: number;
};

type ReferralOption = { id: number; name: string };
type CityOpt = { id: number; name: string };
type VillageOpt = { id: number; name: string };
type BranchOpt = { id: number; name: string };

type Doctor = { id: number; name: string };

type HistoryEntry = {
  id: number;
  type: string;
  notes: string;
  createdAt: string;
  doctor: { id: number; name: string };
  appointment: { id: number; appointmentDate: string; startTime: string } | null;
};

function formatAgeColumn(dateOfBirth: string | null | undefined): string {
  if (dateOfBirth == null || dateOfBirth === "") return "—";
  const n = calculateAgeFromIsoDateString(dateOfBirth);
  return n !== null ? String(n) : "—";
}

function displayPatientAge(p: { age?: number | null; dateOfBirth?: string | null }): string {
  if (p.age != null && Number.isFinite(p.age)) return String(p.age);
  return formatAgeColumn(p.dateOfBirth);
}

function patientRowHasClientActions(
  p: Patient,
  opts: {
    canView: boolean;
    canClinicalNote: boolean;
    canRecordPayment: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }
): boolean {
  const canPayRow = opts.canRecordPayment && (p.accountBalance ?? 0) > 0;
  return (
    opts.canView ||
    opts.canClinicalNote ||
    canPayRow ||
    opts.canEdit ||
    opts.canDelete
  );
}

function historyTypeLabel(t: string) {
  const map: Record<string, string> = {
    chief_complaint: "Chief complaint",
    history: "History",
    examination: "Examination",
    diagnosis: "Diagnosis",
    notes: "Notes",
  };
  return map[t] || t;
}

export default function PatientsPage() {
  const { hasPermission, user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const historyParams = useMemo(
    () =>
      searchParams.get("history") === "1"
        ? { patientId: searchParams.get("patientId"), appointmentId: searchParams.get("appointmentId") }
        : null,
    [searchParams]
  );

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [historyModal, setHistoryModal] = useState(false);
  const [historyForm, setHistoryForm] = useState({ type: "notes", notes: "" });
  const [historyDoctorId, setHistoryDoctorId] = useState("");
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [historyPrior, setHistoryPrior] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySubmitting, setHistorySubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [editModal, setEditModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [clientActionsMenuId, setClientActionsMenuId] = useState<number | null>(null);
  const [referralOptions, setReferralOptions] = useState<ReferralOption[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    phoneNational: "",
    mobileCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    mobileNational: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    cityId: "",
    villageId: "",
    registeredBranchId: "",
    notes: "",
    referralSourceId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentPatient, setPaymentPatient] = useState<Patient | null>(null);

  const canCreate = hasPermission("patients.create") || hasPermission("pharmacy.create");
  const canEdit = hasPermission("patients.edit") || hasPermission("pharmacy.edit");
  const canDelete = hasPermission("patients.delete") || hasPermission("pharmacy.delete");
  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");
  const canClinicalNote =
    hasPermission("patient_history.create") || hasPermission("patient_history.view");
  const canAllBranches = hasPermission("settings.manage");

  const [cities, setCities] = useState<CityOpt[]>([]);
  const [villages, setVillages] = useState<VillageOpt[]>([]);
  const [branches, setBranches] = useState<BranchOpt[]>([]);

  async function loadPatients() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/patients?${params}`);
    if (res.ok) {
      const body = await res.json();
      setPatients(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setHistoryModal(!!historyParams);
  }, [historyParams]);

  useEffect(() => {
    const pid = historyParams?.patientId;
    if (!pid) return;
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      const [drRes, ptRes, hiRes] = await Promise.all([
        authFetch("/api/doctors"),
        authFetch(`/api/patients/${pid}`),
        authFetch(`/api/patient-history?patientId=${encodeURIComponent(pid)}`),
      ]);
      if (cancelled) return;
      if (drRes.ok) {
        const d = await drRes.json();
        setDoctors(Array.isArray(d) ? d : []);
      }
      if (ptRes.ok) {
        const p = await ptRes.json();
        setHistoryPatient(p);
      } else {
        setHistoryPatient(null);
      }
      if (hiRes.ok) {
        const list = await hiRes.json();
        setHistoryPrior(Array.isArray(list) ? list : []);
      } else {
        setHistoryPrior([]);
      }
    })().finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [historyParams?.patientId]);

  useEffect(() => {
    setPage(1);
  }, [search]);

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
    setLoading(true);
    loadPatients().finally(() => setLoading(false));
  }, [search, page]);

  function openPayment(p: Patient) {
    setPaymentPatient(p);
  }

  function closeHistoryModal() {
    setHistoryModal(false);
    setHistoryForm({ type: "notes", notes: "" });
    setHistoryDoctorId("");
    setHistoryPatient(null);
    setHistoryPrior([]);
    if (typeof window !== "undefined") window.history.replaceState({}, "", "/patients");
  }

  async function handleRecordHistory() {
    if (!historyParams?.patientId || !historyForm.notes.trim()) return;
    if (!historyDoctorId) {
      alert("Select a practitioner");
      return;
    }
    setHistorySubmitting(true);
    try {
      const res = await authFetch("/api/patient-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: Number(historyParams.patientId),
          appointmentId: historyParams.appointmentId ? Number(historyParams.appointmentId) : null,
          doctorId: Number(historyDoctorId),
          type: historyForm.type,
          notes: historyForm.notes.trim(),
        }),
      });
      if (res.ok) {
        closeHistoryModal();
      } else {
        alert((await res.json()).error || "Failed");
      }
    } finally {
      setHistorySubmitting(false);
    }
  }

  function openEdit(p: Patient) {
    setEditModal(true);
    setEditingId(p.id);
    const phoneParts = parseStoredPhoneIntoParts(p.phone);
    const mobileParts = parseStoredPhoneIntoParts(p.mobile);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      phoneCountryIso2: phoneParts.countryIso2,
      phoneNational: phoneParts.national,
      mobileCountryIso2: mobileParts.countryIso2,
      mobileNational: mobileParts.national,
      email: p.email ?? "",
      dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
      gender: p.gender ?? "",
      address: p.address ?? "",
      cityId: p.cityId != null ? String(p.cityId) : "",
      villageId: p.villageId != null ? String(p.villageId) : "",
      registeredBranchId: p.registeredBranchId != null ? String(p.registeredBranchId) : "",
      notes: p.notes ?? "",
      referralSourceId: p.referralSourceId != null ? String(p.referralSourceId) : "",
    });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError("");
    const phoneErr = validateClientPhoneNational(form.phoneCountryIso2, form.phoneNational);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    const mobileErr = validateOptionalClientPhoneNational(
      form.mobileCountryIso2,
      form.mobileNational
    );
    if (mobileErr) {
      setError(mobileErr);
      return;
    }
    setSubmitting(true);
    try {
      const {
        phoneCountryIso2,
        phoneNational,
        mobileCountryIso2,
        mobileNational,
        ...formRest
      } = form;
      const payload = {
        ...formRest,
        phone: formatInternationalPhoneForStorage(phoneCountryIso2, phoneNational),
        mobile: formatInternationalPhoneForStorage(mobileCountryIso2, mobileNational),
        referralSourceId: form.referralSourceId ? Number(form.referralSourceId) : null,
        cityId: form.cityId ? Number(form.cityId) : null,
        villageId: form.villageId ? Number(form.villageId) : null,
        registeredBranchId: form.registeredBranchId ? Number(form.registeredBranchId) : null,
      };
      const res = await authFetch(`/api/patients/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update");
        return;
      }
      await loadPatients();
      setEditModal(false);
      setEditingId(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this client?")) return;
    const res = await authFetch(`/api/patients/${id}`, { method: "DELETE" });
    if (res.ok) await loadPatients();
    else alert((await res.json()).error || "Failed to delete");
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Clients" />
        {canCreate && (
          <Link
            href="/patients/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 dark:hover:bg-brand-600"
          >
            <PlusIcon />
            Add client
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">All clients</h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {loading ? "…" : total}
            </span>
          </div>
          <input
            type="text"
            placeholder="Search by name, code, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64 rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No clients yet.</p>
            {canCreate && (
              <Link
                href="/patients/new"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
              >
                <PlusIcon />
                Add client
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader>Mobile</TableCell>
                <TableCell isHeader>Gender</TableCell>
                <TableCell isHeader>Age</TableCell>
                <TableCell isHeader>Branch</TableCell>
                <TableCell isHeader>City</TableCell>
                <TableCell isHeader>Village</TableCell>
                <TableCell isHeader>Referred from</TableCell>
                <TableCell isHeader className="text-right">Balance</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.patientCode}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>{p.mobile || "—"}</TableCell>
                  <TableCell>{p.gender || "—"}</TableCell>
                  <TableCell className="tabular-nums text-sm text-gray-800 dark:text-gray-200">
                    {displayPatientAge(p)}
                  </TableCell>
                  <TableCell className="max-w-[7rem] truncate text-xs text-gray-600 dark:text-gray-400">
                    {p.registeredBranch?.name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[7rem] truncate text-xs text-gray-600 dark:text-gray-400">
                    {p.city?.name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[7rem] truncate text-xs text-gray-600 dark:text-gray-400">
                    {p.village?.name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm text-gray-600 dark:text-gray-400">
                    {p.referralSource?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${(p.accountBalance ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right align-middle overflow-visible">
                    {!patientRowHasClientActions(p, {
                      canView: hasPermission("patients.view"),
                      canClinicalNote,
                      canRecordPayment,
                      canEdit,
                      canDelete,
                    }) ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                    <div className="relative inline-flex justify-end">
                      <button
                        type="button"
                        className="dropdown-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-expanded={clientActionsMenuId === p.id}
                        aria-haspopup="menu"
                        aria-label={`Actions for ${p.name}`}
                        onClick={() =>
                          setClientActionsMenuId((cur) => (cur === p.id ? null : p.id))
                        }
                      >
                        <HorizontaLDots className="h-5 w-5 rotate-90" aria-hidden />
                      </button>
                      <Dropdown
                        isOpen={clientActionsMenuId === p.id}
                        onClose={() => setClientActionsMenuId(null)}
                        className="min-w-[11rem] py-1"
                      >
                        {hasPermission("patients.view") && (
                          <>
                            <DropdownItem
                              tag="a"
                              href={`/patients/${p.id}/history`}
                              onItemClick={() => setClientActionsMenuId(null)}
                            >
                              History
                            </DropdownItem>
                            <DropdownItem
                              tag="a"
                              href={`/patients/${p.id}/care-files`}
                              onItemClick={() => setClientActionsMenuId(null)}
                            >
                              Client files
                            </DropdownItem>
                          </>
                        )}
                        {canClinicalNote && (
                          <DropdownItem
                            tag="a"
                            href={`/patients?history=1&patientId=${p.id}`}
                            onItemClick={() => setClientActionsMenuId(null)}
                          >
                            Clinical note
                          </DropdownItem>
                        )}
                        {canRecordPayment && (p.accountBalance ?? 0) > 0 && (
                          <DropdownItem
                            onClick={() => {
                              openPayment(p);
                              setClientActionsMenuId(null);
                            }}
                          >
                            Record payment
                          </DropdownItem>
                        )}
                        {canEdit && (
                          <DropdownItem
                            onClick={() => {
                              openEdit(p);
                              setClientActionsMenuId(null);
                            }}
                          >
                            Edit
                          </DropdownItem>
                        )}
                        {canDelete && (
                          <DropdownItem
                            onClick={() => {
                              void handleDelete(p.id);
                              setClientActionsMenuId(null);
                            }}
                            className="text-error-600 hover:bg-error-50 hover:text-error-700 dark:text-error-400 dark:hover:bg-error-500/10"
                          >
                            Delete
                          </DropdownItem>
                        )}
                      </Dropdown>
                    </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="clients"
          onPageChange={setPage}
        />
      </div>

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-lg font-semibold">Edit client</h2>
              <button type="button" onClick={() => setEditModal(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">{error}</div>}

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
                <div className="space-y-5">
                  <DateOfBirthSplitFields
                    idPrefix="patient-dob"
                    label="Date of birth"
                    value={form.dateOfBirth}
                    onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                  />
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-end sm:gap-x-8">
                    <AgeReadonlyInput dateOfBirth={form.dateOfBirth} idSuffix="edit" />
                    <div>
                      <Label>Gender</Label>
                      <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white">
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>
                </div>
              </ClientFormCard>

              <ClientFormCard
                title="Address"
                description="City and village. Update both together when changing locality."
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
                    placeholder="Optional"
                  />
                </div>
              </ClientFormCard>

              <ClientFormCard title="Contact details" description="How we reach the client.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ClientPhoneFields
                    label="Phone"
                    countryIso2={form.phoneCountryIso2}
                    national={form.phoneNational}
                    onCountryIso2Change={(phoneCountryIso2) =>
                      setForm((f) => ({ ...f, phoneCountryIso2 }))
                    }
                    onNationalChange={(phoneNational) => setForm((f) => ({ ...f, phoneNational }))}
                    nationalInputId="edit-client-phone-national"
                  />
                  <div>
                    <Label>Email</Label>
                    <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="email@example.com" />
                  </div>
                  <div className="sm:col-span-2">
                    <ClientPhoneFields
                      label="Mobile (optional)"
                      optionalMobile
                      countryIso2={form.mobileCountryIso2}
                      national={form.mobileNational}
                      onCountryIso2Change={(mobileCountryIso2) =>
                        setForm((f) => ({ ...f, mobileCountryIso2 }))
                      }
                      onNationalChange={(mobileNational) =>
                        setForm((f) => ({ ...f, mobileNational }))
                      }
                      nationalInputId="edit-client-mobile-national"
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
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white" placeholder="Allergies, warnings, demographics…" />
                </div>
              </ClientFormCard>

              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
                <Button type="button" variant="outline" onClick={() => setEditModal(false)} size="sm">Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm">{submitting ? "Saving..." : "Update"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentPatient && (
        <PatientPaymentModal
          patient={paymentPatient}
          onClose={() => setPaymentPatient(null)}
          onSuccess={loadPatients}
        />
      )}

      {historyModal && historyParams && canClinicalNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-semibold">Clinical note (treatment history)</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Document this encounter for the chart. When opened from the calendar, the note can be linked to that booking.
                </p>
              </div>
              <button type="button" onClick={closeHistoryModal} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                ×
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {historyLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-800/40">
                    <p>
                      <span className="text-gray-500">Client: </span>
                      <span className="font-medium">{historyPatient?.name ?? "—"}</span>
                      {historyPatient?.patientCode && (
                        <span className="ml-1 font-mono text-xs text-gray-500">({historyPatient.patientCode})</span>
                      )}
                    </p>
                    {historyParams.appointmentId && historyPatient && (
                      <p className="mt-1 text-xs text-gray-500">
                        Linked to booking #{historyParams.appointmentId} (visit documentation).
                      </p>
                    )}
                    {historyPatient?.notes?.trim() && (
                      <p className="mt-2 border-t border-amber-200/80 pt-2 text-xs text-amber-950 dark:border-amber-900 dark:text-amber-100">
                        <span className="font-medium">Chart alerts on file: </span>
                        {historyPatient.notes}
                      </p>
                    )}
                  </div>
                  {historyPrior.length > 0 && (
                    <div>
                      <Label>Previous entries on chart</Label>
                      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Review past notes before adding a new one.</p>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-900/50">
                        {historyPrior.slice(0, 8).map((h) => (
                          <div key={h.id} className="rounded border border-gray-100 px-2 py-1.5 dark:border-gray-800">
                            <span className="font-medium text-gray-700 dark:text-gray-200">{historyTypeLabel(h.type)}</span>
                            <span className="text-gray-400"> · {h.doctor.name} · </span>
                            <span className="text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                            <p className="mt-0.5 line-clamp-3 text-gray-600 dark:text-gray-400">{h.notes}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Section</Label>
                    <select
                      value={historyForm.type}
                      onChange={(e) => setHistoryForm((f) => ({ ...f, type: e.target.value }))}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="chief_complaint">Chief complaint</option>
                      <option value="history">History</option>
                      <option value="examination">Examination</option>
                      <option value="diagnosis">Diagnosis</option>
                      <option value="notes">Clinical notes</option>
                    </select>
                  </div>
                  <div>
                    <Label>Practitioner *</Label>
                    <select
                      required
                      value={historyDoctorId}
                      onChange={(e) => setHistoryDoctorId(e.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="">Select practitioner</option>
                      {doctors.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Note text *</Label>
                    <textarea
                      required
                      value={historyForm.notes}
                      onChange={(e) => setHistoryForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={5}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      placeholder="SOAP-style detail: subjective, objective, assessment, plan…"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button variant="outline" size="sm" onClick={closeHistoryModal}>
                  Cancel
                </Button>
                {hasPermission("patient_history.create") && (
                  <Button size="sm" disabled={historySubmitting || historyLoading} onClick={handleRecordHistory}>
                    {historySubmitting ? "Saving…" : "Save to chart"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
