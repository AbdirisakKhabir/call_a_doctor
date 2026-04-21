"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import DateField from "@/components/form/DateField";
import { contrastingForeground, hexWithAlpha, normalizeServiceColor } from "@/lib/service-color";
import {
  buildDayTimeSlots,
  snapTimeToSlotList,
  type AppointmentCalendarSlotMinutes,
} from "@/lib/appointment-calendar-time";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string; specialty: string | null; branch: { id: number } | null };
type Service = { id: number; name: string; price: number; durationMinutes: number | null; color: string | null };
type Patient = { id: number; patientCode: string; name: string };

type FormServiceLine = {
  serviceId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  color: string | null;
};

function addMinutesToTime(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function totalDurationMinutes(
  lines: { serviceId: number; quantity: number }[],
  catalog: Service[]
): number {
  let sum = 0;
  for (const line of lines) {
    const s = catalog.find((c) => c.id === line.serviceId);
    const d = s?.durationMinutes ?? 30;
    sum += d * line.quantity;
  }
  return sum || 30;
}

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No reminder" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

function buildNewClientRegistrationHref(appointmentDate: string): string {
  const next = "/appointments/new";
  const qs = new URLSearchParams();
  qs.set("next", next);
  if (appointmentDate && /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)) {
    qs.set("apptDate", appointmentDate);
  }
  return `/patients/new?${qs.toString()}`;
}

export default function NewAppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const patientIdFromUrl = searchParams.get("patientId");
  const { hasPermission } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    branchId: "",
    doctorId: "",
    patientId: "",
    appointmentDate: "",
    startTime: "09:00",
    endTime: "09:30",
    notes: "",
    reminderMinutesBefore: "",
    services: [] as FormServiceLine[],
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [calendarSlotMinutes, setCalendarSlotMinutes] = useState<AppointmentCalendarSlotMinutes>(15);
  const [openCareFileLabel, setOpenCareFileLabel] = useState<string | null>(null);
  const [startNewCareFile, setStartNewCareFile] = useState(false);

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canCreatePatient = hasPermission("patients.create") || hasPermission("pharmacy.create");

  const timeSlots = useMemo(() => buildDayTimeSlots(calendarSlotMinutes), [calendarSlotMinutes]);

  useEffect(() => {
    const initialDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);
    setForm((f) => ({ ...f, appointmentDate: initialDate }));
  }, [dateParam]);

  useEffect(() => {
    if (!patientIdFromUrl) return;
    const idNum = Number(patientIdFromUrl);
    if (!Number.isInteger(idNum) || idNum <= 0) return;
    const idStr = String(idNum);
    setForm((f) => (f.patientId === idStr ? f : { ...f, patientId: idStr }));
    let cancelled = false;
    authFetch(`/api/patients/${idNum}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Patient | null) => {
        if (cancelled || !data) return;
        setPatientSearch(`${data.name} (${data.patientCode})`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientIdFromUrl]);

  useEffect(() => {
    if (!form.patientId) {
      setOpenCareFileLabel(null);
      setStartNewCareFile(false);
      return;
    }
    const idNum = Number(form.patientId);
    if (!Number.isInteger(idNum) || idNum <= 0) return;
    let cancelled = false;
    authFetch(`/api/patients/${idNum}/care-files?status=open`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { files?: { fileCode?: string }[] } | null) => {
        if (cancelled) return;
        const first = data?.files?.[0];
        setOpenCareFileLabel(first?.fileCode ?? null);
      })
      .catch(() => {
        if (!cancelled) setOpenCareFileLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.patientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [brRes, drRes, svcRes, calRes] = await Promise.all([
        authFetch("/api/branches"),
        authFetch("/api/doctors"),
        authFetch("/api/services"),
        authFetch("/api/settings/appointment-calendar"),
      ]);
      if (cancelled) return;
      if (brRes.ok) {
        const list: Branch[] = await brRes.json();
        setBranches(list);
        setForm((f) => ({ ...f, branchId: f.branchId || (list[0] ? String(list[0].id) : "") }));
      }
      if (drRes.ok) setDoctors(await drRes.json());
      if (svcRes.ok) setServices(await svcRes.json());
      if (calRes.ok) {
        const cal = (await calRes.json()) as { slotMinutes?: number };
        if (cal.slotMinutes === 15 || cal.slotMinutes === 30) setCalendarSlotMinutes(cal.slotMinutes);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (timeSlots.length === 0) return;
    setForm((f) => {
      const start = snapTimeToSlotList(f.startTime, timeSlots);
      const end = snapTimeToSlotList(f.endTime, timeSlots);
      if (start === f.startTime && end === f.endTime) return f;
      return { ...f, startTime: start, endTime: end };
    });
  }, [calendarSlotMinutes, timeSlots]);

  useEffect(() => {
    const q = patientSearch.trim();
    if (q.length < 2) {
      setPatientSearchResults([]);
      setSearchingPatients(false);
      return;
    }
    setSearchingPatients(true);
    const t = setTimeout(() => {
      authFetch(`/api/patients?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Patient[] | unknown) => {
          setPatientSearchResults(Array.isArray(data) ? data : []);
        })
        .catch(() => setPatientSearchResults([]))
        .finally(() => setSearchingPatients(false));
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  function applyEndTimeFromServices(
    next: FormServiceLine[],
    startTime: string,
    catalog: Service[]
  ) {
    if (next.length === 0) return undefined;
    const mins = totalDurationMinutes(
      next.map((x) => ({ serviceId: x.serviceId, quantity: x.quantity })),
      catalog
    );
    return addMinutesToTime(startTime, mins);
  }

  function addService(s: Service) {
    const existing = form.services.find((x) => x.serviceId === s.id);
    if (existing) return;
    setForm((f) => {
      const next = [
        ...f.services,
        {
          serviceId: s.id,
          name: s.name,
          quantity: 1,
          unitPrice: s.price,
          color: normalizeServiceColor(s.color),
        },
      ];
      const end = applyEndTimeFromServices(next, f.startTime, services);
      return { ...f, services: next, ...(end ? { endTime: end } : {}) };
    });
  }

  function removeService(serviceId: number) {
    setForm((f) => {
      const next = f.services.filter((x) => x.serviceId !== serviceId);
      const end = applyEndTimeFromServices(next, f.startTime, services);
      return { ...f, services: next, ...(next.length && end ? { endTime: end } : {}) };
    });
  }

  function updateServiceQty(serviceId: number, quantity: number) {
    setForm((f) => {
      const next = f.services.map((s) => (s.serviceId === serviceId ? { ...s, quantity: Math.max(1, quantity) } : s));
      const end = applyEndTimeFromServices(next, f.startTime, services);
      return { ...f, services: next, ...(end ? { endTime: end } : {}) };
    });
  }

  function updateServicePrice(serviceId: number, unitPrice: number) {
    setForm((f) => ({
      ...f,
      services: f.services.map((s) => (s.serviceId === serviceId ? { ...s, unitPrice } : s)),
    }));
  }

  const totalCharge = form.services.reduce((s, x) => s + x.quantity * x.unitPrice, 0);

  const filteredDoctors = form.branchId
    ? doctors.filter((d) => !d.branch || d.branch.id === Number(form.branchId))
    : doctors;

  const selectedPatientLabel =
    form.patientId &&
    (patientSearchResults.find((p) => p.id === Number(form.patientId))?.name ||
      patientSearch);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!canCreate) return;
    if (!form.branchId || !form.doctorId || !form.patientId) {
      setError("Branch, doctor and client are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: Number(form.branchId),
          doctorId: Number(form.doctorId),
          patientId: Number(form.patientId),
          appointmentDate: form.appointmentDate,
          startTime: form.startTime,
          endTime: form.endTime,
          notes: form.notes || null,
          reminderMinutesBefore: form.reminderMinutesBefore ? Number(form.reminderMinutesBefore) : null,
          services: form.services.map((s) => ({ serviceId: s.serviceId, quantity: s.quantity, unitPrice: s.unitPrice })),
          ...(startNewCareFile ? { startNewCareFile: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create appointment");
        return;
      }
      router.push("/appointments");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New appointment" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission to create appointments.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New appointment" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-gray-600 dark:text-gray-400">Add at least one branch in Settings before creating appointments.</p>
          <Button className="mt-4" size="sm" onClick={() => router.push("/settings/branches")}>
            Branches & access
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="New appointment" />
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/appointments")}>
          Back to calendar
        </Button>
      </div>

      <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/3">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Location (branch) *</label>
              <select
                required
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value, doctorId: "" }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Practitioner (doctor) *</label>
              <select
                required
                value={form.doctorId}
                onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select doctor</option>
                {filteredDoctors.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} {d.specialty ? `(${d.specialty})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="block text-sm font-medium">Client *</label>
              {canCreatePatient && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  onClick={() => router.push(buildNewClientRegistrationHref(form.appointmentDate))}
                >
                  New client
                </Button>
              )}
            </div>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Search by name, client code, phone, or email — at least 2 characters.</p>
            <input
              type="text"
              placeholder="Search client…"
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                if (!e.target.value.trim()) setForm((f) => ({ ...f, patientId: "" }));
              }}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {patientSearch.trim().length < 2 ? (
                <p className="px-4 py-3 text-sm text-gray-500">Type at least 2 characters to search.</p>
              ) : searchingPatients ? (
                <p className="px-4 py-3 text-sm text-gray-500">Searching…</p>
              ) : patientSearchResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">No clients found.</p>
              ) : (
                patientSearchResults.slice(0, 15).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, patientId: String(p.id) }));
                      setPatientSearch(`${p.name} (${p.patientCode})`);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
                      form.patientId === String(p.id) ? "bg-brand-50 dark:bg-brand-500/10" : ""
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-gray-500">{p.patientCode}</span>
                  </button>
                ))
              )}
            </div>
            {form.patientId && selectedPatientLabel && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">Selected: {selectedPatientLabel}</p>
            )}
            {form.patientId && openCareFileLabel && !startNewCareFile && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Active client file: <span className="font-mono font-medium">{openCareFileLabel}</span>
              </p>
            )}
            {form.patientId && !openCareFileLabel && !startNewCareFile && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                No open file yet — a client file will be created when you save this appointment.
              </p>
            )}
            {form.patientId && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-gray-300 text-brand-600"
                  checked={startNewCareFile}
                  onChange={(e) => setStartNewCareFile(e.target.checked)}
                />
                <span>
                  Start a new client file (closes any other open file). This visit and related charges use the new file.
                </span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DateField
              id="appointment-date"
              label="Date *"
              required
              value={form.appointmentDate}
              onChange={(v) => setForm((f) => ({ ...f, appointmentDate: v }))}
              appendToBody
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Start time *</label>
              <select
                value={form.startTime}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const end = applyEndTimeFromServices(f.services, v, services);
                    return { ...f, startTime: v, ...(f.services.length && end ? { endTime: end } : {}) };
                  });
                }}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                {timeSlots.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">End time (from service duration)</label>
              <select
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                {timeSlots.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-w-md">
            <label className="mb-1 block text-sm font-medium">Reminder</label>
            <select
              value={form.reminderMinutesBefore}
              onChange={(e) => setForm((f) => ({ ...f, reminderMinutesBefore: e.target.value }))}
              className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Services / treatments (charge)</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {services
                .filter((s) => !form.services.some((x) => x.serviceId === s.id))
                .map((s) =>
                  s.color ? (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addService(s)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
                      style={{
                        borderColor: s.color,
                        color: contrastingForeground(hexWithAlpha(s.color, "ff")),
                        backgroundColor: hexWithAlpha(s.color, "18"),
                      }}
                    >
                      + {s.name} (${s.price})
                    </button>
                  ) : (
                    <Button key={s.id} type="button" variant="outline" size="sm" onClick={() => addService(s)}>
                      + {s.name} (${s.price})
                    </Button>
                  )
                )}
            </div>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              {form.services.map((s) => (
                <div
                  key={s.serviceId}
                  className="flex flex-wrap items-center gap-2 rounded-md py-0.5 pl-2"
                  style={
                    s.color
                      ? { borderLeftWidth: 4, borderLeftColor: s.color, borderLeftStyle: "solid" }
                      : undefined
                  }
                >
                  <span className="min-w-0 flex-1 text-sm">{s.name}</span>
                  <input
                    type="number"
                    min="1"
                    value={s.quantity}
                    onChange={(e) => updateServiceQty(s.serviceId, Number(e.target.value))}
                    className="h-9 w-16 rounded border px-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={s.unitPrice}
                    onChange={(e) => updateServicePrice(s.serviceId, Number(e.target.value))}
                    className="h-9 w-20 rounded border px-2 text-sm"
                  />
                  <span className="text-sm font-medium">${(s.quantity * s.unitPrice).toFixed(2)}</span>
                  <button type="button" onClick={() => removeService(s.serviceId)} className="text-error-500 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              {form.services.length > 0 && (
                <div className="border-t pt-2">
                  <div className="font-semibold">Total: ${totalCharge.toFixed(2)}</div>
                  {totalCharge > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This total is charged to the client&apos;s account balance when the appointment is saved.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Appointment notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="h-20 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/appointments")} size="sm">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} size="sm">
              {submitting ? "Booking…" : "Book appointment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
