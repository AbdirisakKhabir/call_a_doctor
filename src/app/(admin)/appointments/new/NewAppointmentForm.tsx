"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { showSwalForAppointmentError } from "@/lib/swal-appointment-error";
import { useAuth } from "@/context/AuthContext";
import DateField from "@/components/form/DateField";
import { normalizeServiceColor } from "@/lib/service-color";
import {
  buildDayTimeSlots,
  parseTimeToMinutes,
  snapTimeToSlotList,
  type AppointmentCalendarSlotMinutes,
} from "@/lib/appointment-calendar-time";
import {
  type ClientScheduleBlock,
  blockAppliesToBookingDay,
  isIntervalBlocked,
  isStartSlotBlockedForNewBooking,
  normalizeClientScheduleBlock,
} from "@/lib/appointment-schedule-block-overlap";
import SaleReceiptModal from "@/components/pharmacy/SaleReceiptModal";

type Branch = { id: number; name: string };
type Doctor = { id: number; name: string; specialty: string | null; branch: { id: number } | null };
type Service = { id: number; name: string; price: number; durationMinutes: number | null; color: string | null };
type Patient = { id: number; patientCode: string; name: string };
type LedgerPaymentMethodRow = { id: number; name: string };

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
  const startTimeParam = searchParams.get("startTime");
  const endTimeParam = searchParams.get("endTime");
  const { hasPermission } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [form, setForm] = useState({
    branchId: "",
    doctorId: "",
    patientId: "",
    appointmentDate: "",
    startTime: "09:00",
    endTime: "09:30",
    notes: "",
    reminderMinutesBefore: "",
    paymentMethodId: "",
    services: [] as FormServiceLine[],
    billingDiscount: "",
    paidAmount: "",
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [calendarSlotMinutes, setCalendarSlotMinutes] = useState<AppointmentCalendarSlotMinutes>(15);
  const [openCareFileLabel, setOpenCareFileLabel] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<LedgerPaymentMethodRow[]>([]);
  const [servicePick, setServicePick] = useState("");
  const [receiptSaleId, setReceiptSaleId] = useState<number | null>(null);
  const [scheduleBlocks, setScheduleBlocks] = useState<ClientScheduleBlock[]>([]);

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canCreatePatient = hasPermission("patients.create") || hasPermission("pharmacy.create");

  const timeSlots = useMemo(() => buildDayTimeSlots(calendarSlotMinutes), [calendarSlotMinutes]);

  const bookingBranchIdN = useMemo(() => {
    const n = Number(form.branchId);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [form.branchId]);
  const bookingDateOk = /^\d{4}-\d{2}-\d{2}$/.test(form.appointmentDate);
  const blocksApplyToUi = bookingBranchIdN != null && bookingDateOk;

  useEffect(() => {
    const initialDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);
    setForm((f) => ({ ...f, appointmentDate: initialDate }));
  }, [dateParam]);

  useEffect(() => {
    if (timeSlots.length === 0) return;
    const stRaw = startTimeParam?.trim();
    if (!stRaw || !/^\d{1,2}:\d{2}$/.test(stRaw)) return;
    const snappedStart = snapTimeToSlotList(stRaw, timeSlots);
    const etRaw = endTimeParam?.trim();
    let snappedEnd =
      etRaw && /^\d{1,2}:\d{2}$/.test(etRaw) ? snapTimeToSlotList(etRaw, timeSlots) : undefined;
    if (!snappedEnd) {
      snappedEnd = snapTimeToSlotList(addMinutesToTime(snappedStart, calendarSlotMinutes), timeSlots);
    }
    const sm = parseTimeToMinutes(snappedStart);
    const em = parseTimeToMinutes(snappedEnd);
    if (sm == null || em == null) return;
    let endFinal = snappedEnd;
    if (em <= sm) {
      endFinal = snapTimeToSlotList(addMinutesToTime(snappedStart, calendarSlotMinutes), timeSlots);
    }
    setForm((f) => ({ ...f, startTime: snappedStart, endTime: endFinal }));
  }, [startTimeParam, endTimeParam, timeSlots, calendarSlotMinutes]);

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
      const [brRes, calRes, pmRes] = await Promise.all([
        authFetch("/api/branches"),
        authFetch("/api/settings/appointment-calendar"),
        authFetch("/api/pharmacy/payment-methods"),
      ]);
      if (cancelled) return;
      if (brRes.ok) {
        const list: Branch[] = await brRes.json();
        setBranches(list);
        setForm((f) => ({ ...f, branchId: f.branchId || (list[0] ? String(list[0].id) : "") }));
      }
      if (calRes.ok) {
        const cal = (await calRes.json()) as { slotMinutes?: number };
        if (cal.slotMinutes === 15 || cal.slotMinutes === 30) setCalendarSlotMinutes(cal.slotMinutes);
      }
      if (pmRes.ok) {
        const raw = (await pmRes.json()) as unknown;
        if (Array.isArray(raw)) {
          setPaymentMethods(
            raw
              .map((x) => ({ id: Number((x as { id?: unknown }).id), name: String((x as { name?: unknown }).name ?? "") }))
              .filter((x) => Number.isInteger(x.id) && x.id > 0 && x.name.trim() !== "")
          );
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const bid = form.branchId.trim();
    if (!bid || !Number.isInteger(Number(bid)) || Number(bid) <= 0) {
      setDoctors([]);
      setServices([]);
      setCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    (async () => {
      const q = encodeURIComponent(bid);
      const [drRes, svcRes] = await Promise.all([
        authFetch(`/api/doctors?branchId=${q}`),
        authFetch(`/api/services?branchId=${q}`),
      ]);
      if (cancelled) return;
      if (drRes.ok) setDoctors(await drRes.json());
      else setDoctors([]);
      if (svcRes.ok) setServices(await svcRes.json());
      else setServices([]);
      if (!cancelled) setCatalogLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [form.branchId]);

  useEffect(() => {
    if (bookingBranchIdN == null || !bookingDateOk) {
      setScheduleBlocks([]);
      return;
    }
    let cancelled = false;
    const q = `startDate=${encodeURIComponent(form.appointmentDate)}&endDate=${encodeURIComponent(form.appointmentDate)}`;
    authFetch(`/api/settings/appointment-blocks?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { blocks?: unknown[] } | null) => {
        if (cancelled || !data?.blocks) return;
        const list = data.blocks
          .map(normalizeClientScheduleBlock)
          .filter(Boolean) as ClientScheduleBlock[];
        setScheduleBlocks(list);
      })
      .catch(() => {
        if (!cancelled) setScheduleBlocks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingBranchIdN, bookingDateOk, form.appointmentDate]);

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

  useEffect(() => {
    if (bookingBranchIdN == null || !bookingDateOk || timeSlots.length === 0) return;
    const bid = bookingBranchIdN;
    const d = form.appointmentDate;

    setForm((f) => {
      if (Number(f.branchId) !== bid || f.appointmentDate !== d) return f;

      let next = { ...f };
      let changed = false;

      if (isStartSlotBlockedForNewBooking(next.startTime, scheduleBlocks, d, bid)) {
        const firstStart = timeSlots.find((t) => !isStartSlotBlockedForNewBooking(t, scheduleBlocks, d, bid));
        if (!firstStart) return f;
        next.startTime = firstStart;
        changed = true;
        const end = applyEndTimeFromServices(next.services, firstStart, services);
        if (end) next.endTime = snapTimeToSlotList(end, timeSlots);
      }

      if (isIntervalBlocked(next.startTime, next.endTime, scheduleBlocks, d, bid)) {
        const endSvc = applyEndTimeFromServices(next.services, next.startTime, services);
        if (endSvc) {
          const snapped = snapTimeToSlotList(endSvc, timeSlots);
          if (!isIntervalBlocked(next.startTime, snapped, scheduleBlocks, d, bid)) {
            next.endTime = snapped;
            changed = true;
          }
        }
        if (isIntervalBlocked(next.startTime, next.endTime, scheduleBlocks, d, bid)) {
          const endOk = timeSlots.find((t) => {
            const sm = parseTimeToMinutes(next.startTime);
            const em = parseTimeToMinutes(t);
            return sm != null && em != null && em > sm && !isIntervalBlocked(next.startTime, t, scheduleBlocks, d, bid);
          });
          if (endOk) {
            next.endTime = endOk;
            changed = true;
          }
        }
      }

      return changed ? next : f;
    });
  }, [bookingBranchIdN, bookingDateOk, form.appointmentDate, scheduleBlocks, timeSlots, services, form.services]);

  const totalCharge = form.services.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const billingDiscountAmount = useMemo(() => {
    const raw = Number(form.billingDiscount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(totalCharge, raw);
  }, [form.billingDiscount, totalCharge]);
  const amountToCollect = Math.max(0, totalCharge - billingDiscountAmount);
  const paidNowClamped = useMemo(() => {
    if (!form.paymentMethodId || amountToCollect <= 0) return 0;
    const raw = form.paidAmount.trim();
    if (raw === "") return amountToCollect;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.min(amountToCollect, Math.max(0, n));
  }, [form.paymentMethodId, form.paidAmount, amountToCollect]);
  const balanceRemaining = Math.max(0, amountToCollect - paidNowClamped);

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
    const paidTrim = form.paidAmount.trim();
    if (paidTrim !== "" && form.paymentMethodId === "") {
      const p = Number(paidTrim);
      if (Number.isFinite(p) && p > 0) {
        setError("Select a payment method to record a payment.");
        return;
      }
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
          ...(form.paymentMethodId
            ? { paymentMethodId: Number(form.paymentMethodId) }
            : {}),
          ...(totalCharge > 0 ? { billingDiscount: billingDiscountAmount } : {}),
          ...(form.paymentMethodId && amountToCollect > 0 && form.paidAmount.trim() !== ""
            ? {
                paidAmount: Math.min(amountToCollect, Math.max(0, Number(form.paidAmount))),
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Failed to create booking";
        await showSwalForAppointmentError(msg, "Could not create booking");
        return;
      }
      const sid =
        typeof data.createdBillingSaleId === "number" &&
        Number.isInteger(data.createdBillingSaleId) &&
        data.createdBillingSaleId > 0
          ? data.createdBillingSaleId
          : null;
      if (sid != null) {
        setReceiptSaleId(sid);
      } else {
        router.push("/appointments");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New booking" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission to add calendar bookings.</p>
      </div>
    );
  }

  if (loading || catalogLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="New booking" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-gray-600 dark:text-gray-400">Add at least one branch in Settings before adding calendar bookings.</p>
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
        <PageBreadCrumb pageTitle="New booking" />
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
                {doctors.map((d) => (
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
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Min. 2 characters.</p>
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
            {form.patientId && openCareFileLabel && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Active client file: <span className="font-mono font-medium">{openCareFileLabel}</span>
              </p>
            )}
            {form.patientId && !openCareFileLabel && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                No open file yet — a client file will be created when you save this booking.
              </p>
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
                {timeSlots.map((t) => {
                  const blocked =
                    blocksApplyToUi &&
                    bookingBranchIdN != null &&
                    isStartSlotBlockedForNewBooking(t, scheduleBlocks, form.appointmentDate, bookingBranchIdN);
                  return (
                    <option key={t} value={t} disabled={!!blocked}>
                      {blocked ? `${t} — blocked` : t}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">End time (from service duration)</label>
              <select
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              >
                {timeSlots.map((t) => {
                  const sm = parseTimeToMinutes(form.startTime);
                  const em = parseTimeToMinutes(t);
                  const beforeOrEqualStart = sm != null && em != null && em <= sm;
                  const blocked =
                    blocksApplyToUi &&
                    bookingBranchIdN != null &&
                    (beforeOrEqualStart ||
                      isIntervalBlocked(form.startTime, t, scheduleBlocks, form.appointmentDate, bookingBranchIdN));
                  return (
                    <option key={t} value={t} disabled={!!blocked}>
                      {blocked && !beforeOrEqualStart ? `${t} — blocked` : t}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          {blocksApplyToUi &&
            bookingBranchIdN != null &&
            scheduleBlocks.some((b) => blockAppliesToBookingDay(b, form.appointmentDate, bookingBranchIdN)) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Times that fall in branch closed hours are unavailable.
            </p>
          )}

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
            <select
              className="h-11 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-4 py-2.5 text-sm dark:border-gray-700 dark:text-white"
              value={servicePick}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setServicePick("");
                  return;
                }
                const id = Number(v);
                const svc = services.find((s) => s.id === id);
                if (svc) addService(svc);
                setServicePick("");
              }}
            >
              <option value="">Add a service…</option>
              {services
                .filter((s) => !form.services.some((x) => x.serviceId === s.id))
                .map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} (${s.price.toFixed(2)})
                  </option>
                ))}
            </select>

            {form.services.length > 0 ? (
              <div className="mt-3 space-y-2">
                {form.services.map((s) => (
                  <div
                    key={s.serviceId}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 py-2 pl-3 pr-2 dark:border-gray-800"
                    style={
                      s.color
                        ? { borderLeftWidth: 4, borderLeftColor: s.color, borderLeftStyle: "solid" }
                        : undefined
                    }
                  >
                    <span className="min-w-0 flex-1 text-sm font-medium">{s.name}</span>
                    <input
                      type="number"
                      min="1"
                      value={s.quantity}
                      onChange={(e) => updateServiceQty(s.serviceId, Number(e.target.value))}
                      className="h-9 w-16 rounded border border-gray-200 px-2 text-sm dark:border-gray-700"
                      aria-label={`Quantity for ${s.name}`}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={s.unitPrice}
                      onChange={(e) => updateServicePrice(s.serviceId, Number(e.target.value))}
                      className="h-9 w-24 rounded border border-gray-200 px-2 text-sm dark:border-gray-700"
                      aria-label={`Unit price for ${s.name}`}
                    />
                    <span className="text-sm font-medium tabular-nums">${(s.quantity * s.unitPrice).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => removeService(s.serviceId)}
                      className="text-sm text-error-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No services added yet.</p>
            )}
          </div>

          {totalCharge > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-white/5">
              <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-100">Billing</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">Payment method</label>
                  <select
                    value={form.paymentMethodId}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentMethodId: e.target.value,
                        ...(e.target.value === "" ? { paidAmount: "" } : {}),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-600 dark:bg-white/5 dark:text-white"
                    disabled={paymentMethods.length === 0}
                  >
                    <option value="">Account only (no till entry)</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={String(pm.id)}>
                        {pm.name}
                      </option>
                    ))}
                  </select>
                  {paymentMethods.length === 0 ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      No payment methods in Settings → Payment methods.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="new-appt-billing-discount" className="mb-1 block text-sm font-medium">
                    Discount
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      id="new-appt-billing-discount"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.billingDiscount}
                      onChange={(e) => setForm((f) => ({ ...f, billingDiscount: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2 pl-7 pr-3 text-sm tabular-nums dark:border-gray-600 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="new-appt-paid-now" className="mb-1 block text-sm font-medium">
                    Paid now
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      $
                    </span>
                    <input
                      id="new-appt-paid-now"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.paidAmount}
                      onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))}
                      disabled={!form.paymentMethodId || amountToCollect <= 0}
                      placeholder={form.paymentMethodId ? "Leave blank for pay in full" : ""}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2 pl-7 pr-3 text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-4 text-sm dark:border-gray-600 sm:grid-cols-4">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Subtotal</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">${totalCharge.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">After discount</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">${amountToCollect.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Paid</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">
                    {form.paymentMethodId ? `$${paidNowClamped.toFixed(2)}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Client balance</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-white">
                    ${balanceRemaining.toFixed(2)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium">Booking notes</label>
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
              {submitting ? "Saving…" : "Save booking"}
            </Button>
          </div>
        </form>
      </div>

      <SaleReceiptModal
        saleId={receiptSaleId}
        open={receiptSaleId != null}
        bannerTitle="Booking saved"
        onClose={() => {
          setReceiptSaleId(null);
          router.push("/appointments");
        }}
      />
    </div>
  );
}
