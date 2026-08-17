"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pill, Plus, Search, Trash2 } from "lucide-react";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { authFetch } from "@/lib/api";
import { showErrorAlert } from "@/lib/swal-dialogs";
import { calculateAgeFromIsoDateString } from "@/lib/age-from-dob";
import { parseAllergiesInfectionsFromNotes } from "@/lib/patient-allergies-notes";

type ProductHit = {
  id: number;
  name: string;
  code: string;
  quantity: number;
  unit?: string | null;
  sellingPrice?: number;
};

type RxLine = {
  productId: number;
  name: string;
  code: string;
  stock: number;
  unit: string;
  quantity: number;
  dosage: string;
  instructions: string;
};

type PatientBrief = {
  id: number;
  name: string;
  patientCode: string;
  notes: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  gender?: string | null;
};

type AppointmentBrief = {
  id: number;
  appointmentDate: string;
  startTime: string;
  doctor?: { id: number; name: string; specialty?: string | null };
  branch?: { id: number; name: string };
  patient?: { id: number; name: string; patientCode: string };
};

const SIG_TEMPLATES = [
  "1 tablet twice daily after meals",
  "1 tablet three times daily",
  "1 tablet once daily",
  "1 tablet at bedtime",
  "5 ml three times daily",
  "Apply twice daily",
  "Use as directed",
];

function formatVisitDate(dateStr: string, time?: string) {
  const d = new Date(dateStr);
  const date = Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return time ? `${date} · ${time}` : date;
}

type Props = {
  appointmentId: number;
  patientId: number;
  doctorId: number;
  branchId: number;
};

export default function PrescriptionCreateForm({ appointmentId, patientId, doctorId, branchId }: Props) {
  const router = useRouter();
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [patient, setPatient] = useState<PatientBrief | null>(null);
  const [appointment, setAppointment] = useState<AppointmentBrief | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [notes, setNotes] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [items, setItems] = useState<RxLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addedIds = useMemo(() => new Set(items.map((i) => i.productId)), [items]);

  const allergy = useMemo(() => parseAllergiesInfectionsFromNotes(patient?.notes), [patient?.notes]);

  const ageYears = useMemo(() => {
    if (typeof patient?.age === "number" && Number.isFinite(patient.age)) return patient.age;
    if (patient?.dateOfBirth) return calculateAgeFromIsoDateString(String(patient.dateOfBirth).slice(0, 10));
    return null;
  }, [patient]);

  useEffect(() => {
    let cancelled = false;
    setContextLoading(true);
    Promise.all([
      authFetch(`/api/patients/${patientId}`).then((r) => (r.ok ? r.json() : null)),
      authFetch(`/api/appointments/${appointmentId}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, a]) => {
        if (cancelled) return;
        if (p) setPatient(p as PatientBrief);
        if (a) setAppointment(a as AppointmentBrief);
      })
      .catch(() => {
        /* visit context is optional for saving; IDs still come from the URL */
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId, patientId]);

  const runSearch = useCallback(
    async (term: string) => {
      if (!branchId) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({
          branchId: String(branchId),
          limit: "20",
        });
        if (term.trim()) params.set("q", term.trim());
        const res = await authFetch(`/api/pharmacy/products/search?${params}`);
        if (res.ok) {
          const data: ProductHit[] = await res.json();
          setHits(Array.isArray(data) ? data : []);
        } else {
          setHits([]);
        }
      } finally {
        setSearching(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    if (!searchOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchOpen, runSearch]);

  useEffect(() => {
    if (!searchOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (searchWrapRef.current?.contains(e.target as Node)) return;
      setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [searchOpen]);

  function addProduct(p: ProductHit) {
    if (addedIds.has(p.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        code: p.code,
        stock: p.quantity,
        unit: p.unit?.trim() || "units",
        quantity: 1,
        dosage: "",
        instructions: "",
      },
    ]);
    setQuery("");
    setSearchOpen(false);
  }

  function removeProduct(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function updateLine(productId: number, field: keyof RxLine, value: string | number) {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)));
  }

  async function handleSave() {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          patientId,
          doctorId,
          isEmergency,
          notes: notes.trim() || null,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            dosage: i.dosage.trim() || undefined,
            instructions: i.instructions.trim() || undefined,
          })),
        }),
      });
      if (res.ok) {
        router.push("/appointments");
        router.refresh();
      } else {
        await showErrorAlert((await res.json()).error || "Failed to save prescription");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const clientName = patient?.name || appointment?.patient?.name || "Client";
  const clientCode = patient?.patientCode || appointment?.patient?.patientCode || "";
  const doctorName = appointment?.doctor?.name;
  const branchName = appointment?.branch?.name;
  const visibleHits = hits.filter((p) => !addedIds.has(p.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        {contextLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading client…</p>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Prescribing for
            </p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{clientName}</h2>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  {clientCode && <span className="font-mono">{clientCode}</span>}
                  {ageYears != null && (
                    <span>
                      {clientCode ? " · " : ""}
                      {ageYears} yrs
                    </span>
                  )}
                  {patient?.gender?.trim() && <span> · {patient.gender}</span>}
                </p>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {doctorName && <p>Dr. {doctorName}</p>}
                {appointment && <p>{formatVisitDate(appointment.appointmentDate, appointment.startTime)}</p>}
                {branchName && <p className="text-gray-500 dark:text-gray-400">{branchName}</p>}
              </div>
            </div>
          </>
        )}

        {allergy.selection === "yes" ? (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Allergies / infections on file</p>
              <p className="mt-0.5">{allergy.detail || "Recorded as yes — check the chart before prescribing."}</p>
            </div>
          </div>
        ) : allergy.selection === "no" ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">No allergies/infections recorded on the chart.</p>
        ) : patient?.notes?.trim() ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
            <span className="font-medium">Chart notes: </span>
            {patient.notes}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">1. Find a medicine</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Search the branch retail stock, then add each medicine the client should receive.
        </p>
        <div ref={searchWrapRef} className="relative mt-4">
          <Label htmlFor="rx-medicine-search">Medicine name or code</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              id="rx-medicine-search"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="e.g. Amoxicillin, paracetamol…"
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent pl-10 pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
            />
          </div>
          {searchOpen && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              {searching && (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Searching…</li>
              )}
              {!searching && visibleHits.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  {query.trim()
                    ? "No in-stock retail medicines match that search."
                    : "Type to search, or pick from in-stock retail medicines."}
                </li>
              )}
              {visibleHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-brand-500/10"
                  >
                    <span>
                      <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-500">{p.code}</span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {p.quantity} {p.unit?.trim() || "in stock"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          2. How should the client take it
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Quantity is what pharmacy gives out. Dose and “how to take” go on the label for the client.
        </p>

        {items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center dark:border-gray-700">
            <Pill className="h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden />
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">No medicines added yet</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Search above and click a medicine to add a line.</p>
          </div>
        ) : (
          <ol className="mt-4 space-y-4">
            {items.map((item, index) => (
              <li
                key={item.productId}
                className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-400">Medicine {index + 1}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.code} · {item.stock} {item.unit} in stock
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProduct(item.productId)}
                    className="rounded-lg p-2 text-error-500 hover:bg-error-50 dark:hover:bg-error-500/10"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`qty-${item.productId}`}>Quantity to give</Label>
                    <input
                      id={`qty-${item.productId}`}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateLine(item.productId, "quantity", Math.max(1, Number(e.target.value) || 1))
                      }
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">Packs or {item.unit} from this branch’s stock.</p>
                  </div>
                  <div>
                    <Label htmlFor={`dose-${item.productId}`}>Dose / strength</Label>
                    <input
                      id={`dose-${item.productId}`}
                      type="text"
                      value={item.dosage}
                      onChange={(e) => updateLine(item.productId, "dosage", e.target.value)}
                      placeholder="e.g. 500 mg"
                      className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">What each dose is (optional).</p>
                  </div>
                </div>

                <div className="mt-3">
                  <Label htmlFor={`sig-${item.productId}`}>How to take (SIG)</Label>
                  <input
                    id={`sig-${item.productId}`}
                    type="text"
                    value={item.instructions}
                    onChange={(e) => updateLine(item.productId, "instructions", e.target.value)}
                    placeholder="e.g. 1 tablet twice daily after meals"
                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SIG_TEMPLATES.map((sig) => (
                      <button
                        key={sig}
                        type="button"
                        onClick={() => updateLine(item.productId, "instructions", sig)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          item.instructions === sig
                            ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-200"
                            : "border-gray-200 bg-white text-gray-600 hover:border-brand-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                        }`}
                      >
                        {sig}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearchOpen(true);
              document.getElementById("rx-medicine-search")?.focus();
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            <Plus className="h-4 w-4" />
            Add another medicine
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">3. Pharmacy notes (optional)</h3>
        <Label htmlFor="rx-notes" className="mt-3">
          Note for the whole prescription
        </Label>
        <textarea
          id="rx-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. generic substitution allowed, give with food…"
          className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={isEmergency}
            onChange={(e) => setIsEmergency(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-brand-600"
          />
          <span>
            Emergency prescription
            <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
              Use for urgent or unscheduled care. More than one emergency prescription is allowed for the same client.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/appointments")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button size="sm" disabled={submitting || items.length === 0} onClick={() => void handleSave()}>
          {submitting ? "Saving…" : "Save prescription"}
        </Button>
      </div>
    </div>
  );
}
