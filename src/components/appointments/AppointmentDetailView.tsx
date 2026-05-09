"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
import { confirmCancelAppointment, showSwalForAppointmentError } from "@/lib/swal-appointment-error";
import { useAuth } from "@/context/AuthContext";
import { ArrowRightIcon, ChevronLeftIcon } from "@/icons";
import {
  addCalendarDaysIso,
  addMinutesToHHmm,
  appointmentDurationMinutes,
  buildDayTimeSlots,
  formatMinutesAsLabel,
  formatReminderLabel,
  parseTimeToMinutes,
  snapTimeToSlotList,
} from "@/lib/appointment-calendar-time";
import {
  type ClientScheduleBlock,
  blockAppliesToBookingDay,
  isIntervalBlocked,
  normalizeClientScheduleBlock,
} from "@/lib/appointment-schedule-block-overlap";

const REMINDER_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No reminder" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

export type AppointmentDetail = {
  id: number;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  reminderMinutesBefore?: number | null;
  status: string;
  totalAmount: number;
  paymentMethod: { id: number; name: string } | null;
  branch: { id: number; name: string };
  doctor: { id: number; name: string; specialty: string | null };
  patient: { id: number; patientCode: string; name: string };
  services: {
    service: { id: number; name: string; color: string | null };
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }[];
  sales?: {
    id: number;
    saleDate: string;
    totalAmount: number;
    discount: number;
    paymentMethod: string;
    kind: string;
    depositTransaction: { id: number } | null;
  }[];
};

type Props = { appointmentId: number };
type BranchOption = { id: number; name: string };
type DoctorOption = { id: number; name: string; specialty: string | null };
type ServiceOption = { id: number; name: string; price: number; color: string | null };
type EditableServiceLine = { serviceId: number; name: string; quantity: number; unitPrice: number; color: string | null };

export default function AppointmentDetailView({ appointmentId }: Props) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canEditAppointments = hasPermission("appointments.edit");

  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotMinutes, setSlotMinutes] = useState<15 | 30>(15);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [patchLoading, setPatchLoading] = useState(false);
  const [adjacentLoading, setAdjacentLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<{ id: number; name: string }[]>([]);
  const [paymentMethodDraft, setPaymentMethodDraft] = useState("");
  const [billingDiscount, setBillingDiscount] = useState("");
  const [scheduleBlocks, setScheduleBlocks] = useState<ClientScheduleBlock[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceOption[]>([]);
  const [servicePick, setServicePick] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editDoctorId, setEditDoctorId] = useState("");
  const [editServices, setEditServices] = useState<EditableServiceLine[]>([]);

  const rescheduleTimeOptions = useMemo(() => buildDayTimeSlots(slotMinutes), [slotMinutes]);

  const loadAppointment = useCallback(async () => {
    setLoadError("");
    const res = await authFetch(`/api/appointments/${appointmentId}`);
    const data = (await res.json()) as AppointmentDetail & { error?: string };
    if (!res.ok) {
      setLoadError(typeof data.error === "string" ? data.error : "Could not load booking");
      setAppointment(null);
      return;
    }
    setAppointment(data);
  }, [appointmentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAppointment().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAppointment]);

  useEffect(() => {
    if (!canEditAppointments) return;
    let cancelled = false;
    authFetch("/api/pharmacy/payment-methods").then(async (res) => {
      if (cancelled || !res.ok) return;
      const data = (await res.json()) as { id: number; name: string }[];
      if (Array.isArray(data)) setPaymentMethods(data);
    });
    return () => {
      cancelled = true;
    };
  }, [canEditAppointments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch("/api/settings/appointment-calendar");
      if (cancelled || !res.ok) return;
      const data = (await res.json()) as { slotMinutes?: number };
      const n = data.slotMinutes;
      if (n === 15 || n === 30) setSlotMinutes(n);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appointment) return;
    const slots = buildDayTimeSlots(slotMinutes);
    setRescheduleDate(appointment.appointmentDate.slice(0, 10));
    setRescheduleStart(snapTimeToSlotList(appointment.startTime, slots));
    const rawEnd =
      appointment.endTime ?? addMinutesToHHmm(appointment.startTime, 30) ?? appointment.startTime;
    setRescheduleEnd(snapTimeToSlotList(rawEnd, slots));
    setEditBranchId(String(appointment.branch.id));
    setEditDoctorId(String(appointment.doctor.id));
    setEditServices(
      appointment.services.map((s) => ({
        serviceId: s.service.id,
        name: s.service.name,
        color: s.service.color,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
      }))
    );
    setPaymentMethodDraft(appointment.paymentMethod?.id ? String(appointment.paymentMethod.id) : "");
  }, [appointment, slotMinutes]);

  useEffect(() => {
    if (!canEditAppointments) return;
    let cancelled = false;
    authFetch("/api/branches")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: BranchOption[]) => {
        if (cancelled) return;
        setBranches(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canEditAppointments]);

  useEffect(() => {
    if (!canEditAppointments) return;
    const bid = Number(editBranchId);
    if (!Number.isInteger(bid) || bid <= 0) {
      setDoctors([]);
      setServiceCatalog([]);
      return;
    }
    let cancelled = false;
    Promise.all([authFetch(`/api/doctors?branchId=${bid}`), authFetch(`/api/services?branchId=${bid}`)])
      .then(async ([drRes, svcRes]) => {
        if (cancelled) return;
        setDoctors(drRes.ok ? await drRes.json() : []);
        setServiceCatalog(svcRes.ok ? await svcRes.json() : []);
      })
      .catch(() => {
        if (!cancelled) {
          setDoctors([]);
          setServiceCatalog([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canEditAppointments, editBranchId]);

  useEffect(() => {
    if (!appointment || !/^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate)) {
      setScheduleBlocks([]);
      return;
    }
    let cancelled = false;
    const q = `startDate=${encodeURIComponent(rescheduleDate)}&endDate=${encodeURIComponent(rescheduleDate)}`;
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
  }, [appointment?.id, rescheduleDate]);

  const rescheduleDurationMin = useMemo(() => {
    const sm = parseTimeToMinutes(rescheduleStart);
    const em = parseTimeToMinutes(rescheduleEnd);
    if (sm != null && em != null && em > sm) return em - sm;
    if (appointment) return appointmentDurationMinutes(appointment.startTime, appointment.endTime);
    return 30;
  }, [rescheduleStart, rescheduleEnd, appointment]);

  useEffect(() => {
    if (!appointment || !/^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate) || rescheduleTimeOptions.length === 0) return;
    const bid = appointment.branch.id;
    const slots = rescheduleTimeOptions;

    const startOk = (s: string) => {
      const e = addMinutesToHHmm(s, rescheduleDurationMin);
      return e != null && !isIntervalBlocked(s, e, scheduleBlocks, rescheduleDate, bid);
    };

    let ns = rescheduleStart;
    let ne = rescheduleEnd;

    if (!startOk(ns)) {
      const first = slots.find(startOk);
      if (first) {
        ns = first;
        const e = addMinutesToHHmm(first, rescheduleDurationMin);
        ne = e ? snapTimeToSlotList(e, slots) : ne;
      }
    }
    if (isIntervalBlocked(ns, ne, scheduleBlocks, rescheduleDate, bid)) {
      const sm = parseTimeToMinutes(ns);
      const fixedEnd = slots.find((t) => {
        const em = parseTimeToMinutes(t);
        return sm != null && em != null && em > sm && !isIntervalBlocked(ns, t, scheduleBlocks, rescheduleDate, bid);
      });
      if (fixedEnd) ne = fixedEnd;
    }
    if (ns === rescheduleStart && ne === rescheduleEnd) return;
    setRescheduleStart(ns);
    setRescheduleEnd(ne);
  }, [
    appointment,
    scheduleBlocks,
    rescheduleDate,
    rescheduleTimeOptions,
    rescheduleStart,
    rescheduleEnd,
    rescheduleDurationMin,
  ]);

  async function patchAppointment(
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; error?: string }> {
    setPatchLoading(true);
    try {
      const res = await authFetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AppointmentDetail & { error?: string };
      if (!res.ok) {
        return { ok: false, error: typeof data.error === "string" ? data.error : "Request failed" };
      }
      setAppointment(data);
      return { ok: true };
    } finally {
      setPatchLoading(false);
    }
  }

  async function loadAdjacent(direction: "prev" | "next") {
    setAdjacentLoading(true);
    try {
      const res = await authFetch(`/api/appointments/${appointmentId}/adjacent?direction=${direction}`);
      const data = (await res.json()) as { appointment?: AppointmentDetail | null };
      if (res.ok && data.appointment) {
        router.replace(`/appointments/${data.appointment.id}`);
      }
    } finally {
      setAdjacentLoading(false);
    }
  }

  async function updateReminder(value: string) {
    if (!appointment || !canEditAppointments) return;
    await patchAppointment({
      reminderMinutesBefore: value === "" ? null : Number(value),
    });
  }

  async function updatePaymentPreference(value: string) {
    if (!appointment || !canEditAppointments) return;
    const raw = value.trim();
    await patchAppointment({
      paymentMethodId: raw === "" ? null : Number(raw),
    });
  }

  async function completeVisit() {
    if (!appointment || !canEditAppointments) return;
    if (
      !window.confirm(
        "Mark this visit as completed? Service consumables will be deducted and, if the visit has a total, a sale and till deposit will be recorded."
      )
    ) {
      return;
    }
    const disc =
      appointment.totalAmount > 0 && billingDiscount.trim() !== ""
        ? Math.max(0, Number(billingDiscount) || 0)
        : 0;
    const body: Record<string, unknown> = { status: "completed" };
    if (disc > 0) body.billingDiscount = disc;
    const r = await patchAppointment(body);
    if (!r.ok) {
      window.alert(r.error || "Could not complete visit.");
      return;
    }
    goToCalendar();
  }

  async function cancelAppointment() {
    if (!appointment || !canEditAppointments) return;
    if (!(await confirmCancelAppointment())) return;
    const ok = await patchAppointment({ status: "cancelled" });
    if (ok.ok) goToCalendar();
    else if (ok.error) await showSwalForAppointmentError(ok.error, "Could not cancel booking");
  }

  function goToCalendar() {
    router.push("/appointments");
  }

  async function applyReschedule() {
    if (!appointment || !canEditAppointments) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate)) {
      window.alert("Choose a valid date.");
      return;
    }
    const sm = parseTimeToMinutes(rescheduleStart);
    const em = parseTimeToMinutes(rescheduleEnd);
    if (sm == null || em == null) {
      window.alert("Invalid start or end time.");
      return;
    }
    if (em <= sm) {
      window.alert("End time must be after start time.");
      return;
    }
    if (!editBranchId || !editDoctorId) {
      window.alert("Branch and doctor are required.");
      return;
    }
    if (editServices.length === 0) {
      window.alert("Select at least one service.");
      return;
    }
    const r = await patchAppointment({
      appointmentDate: rescheduleDate,
      startTime: rescheduleStart,
      endTime: rescheduleEnd,
      branchId: Number(editBranchId),
      doctorId: Number(editDoctorId),
      services: editServices.map((s) => ({ serviceId: s.serviceId, quantity: s.quantity, unitPrice: s.unitPrice })),
    });
    if (!r.ok) {
      await showSwalForAppointmentError(
        r.error || "Could not reschedule. Check permissions or try again.",
        "Could not reschedule"
      );
      return;
    }
    goToCalendar();
  }

  function addEditableService(svcIdRaw: string) {
    const svcId = Number(svcIdRaw);
    if (!Number.isInteger(svcId) || svcId <= 0) return;
    const svc = serviceCatalog.find((s) => s.id === svcId);
    if (!svc) return;
    setEditServices((rows) =>
      rows.some((r) => r.serviceId === svcId)
        ? rows
        : [...rows, { serviceId: svc.id, name: svc.name, color: svc.color, quantity: 1, unitPrice: svc.price }]
    );
  }

  async function shiftTimeBy(deltaMin: number) {
    if (!appointment || !canEditAppointments) return;
    const { startTime, endTime } = appointment;
    const newStart = addMinutesToHHmm(startTime, deltaMin);
    if (!newStart) return;
    let newEnd: string | null = null;
    if (endTime) {
      newEnd = addMinutesToHHmm(endTime, deltaMin);
      if (!newEnd) return;
    }
    const r = await patchAppointment({ startTime: newStart, endTime: newEnd });
    if (!r.ok) {
      if (r.error) await showSwalForAppointmentError(r.error, "Could not move booking");
      return;
    }
    goToCalendar();
  }

  async function shiftDayBy(days: number) {
    if (!appointment || !canEditAppointments) return;
    const iso = appointment.appointmentDate.slice(0, 10);
    const newDate = addCalendarDaysIso(iso, days);
    const r = await patchAppointment({ appointmentDate: newDate });
    if (!r.ok) {
      if (r.error) await showSwalForAppointmentError(r.error, "Could not move booking");
      return;
    }
    goToCalendar();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
      </div>
    );
  }

  if (loadError || !appointment) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Booking" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{loadError || "Booking not found."}</p>
          <Link href="/appointments" className="mt-4 inline-block font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to calendar
          </Link>
        </div>
      </div>
    );
  }

  const a = appointment;

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <PageBreadCrumb pageTitle="Booking" />

      <div className="mt-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/appointments"
          className="inline-flex w-fit items-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Back to calendar
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Previous booking"
            disabled={adjacentLoading || patchLoading}
            onClick={() => void loadAdjacent("prev")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="Next booking"
            disabled={adjacentLoading || patchLoading}
            onClick={() => void loadAdjacent("next")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-4 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white px-5 py-6 shadow-sm dark:border-gray-800 dark:bg-white/3 sm:px-8">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Booking summary</h1>
        {(adjacentLoading || patchLoading) && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Updating…</p>
        )}

        <div className="mt-6 space-y-3 text-sm">
          <p>
            <span className="text-gray-500">Date:</span> {a.appointmentDate.slice(0, 10)}
          </p>
          <p>
            <span className="text-gray-500">Start:</span> {a.startTime}
          </p>
          <p>
            <span className="text-gray-500">End:</span> {a.endTime ?? "—"}
          </p>
          <p>
            <span className="text-gray-500">Duration:</span>{" "}
            {formatMinutesAsLabel(appointmentDurationMinutes(a.startTime, a.endTime))}
          </p>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-gray-500">Reminder:</span>
            {canEditAppointments ? (
              <select
                value={a.reminderMinutesBefore ?? ""}
                disabled={patchLoading}
                onChange={(e) => void updateReminder(e.target.value)}
                className="h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              >
                {REMINDER_SELECT_OPTIONS.map((o) => (
                  <option key={o.value || "none"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span>{formatReminderLabel(a.reminderMinutesBefore)}</span>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-800/50">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Payment details</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={paymentMethodDraft}
                disabled={!canEditAppointments || patchLoading || paymentMethods.length === 0}
                onChange={(e) => setPaymentMethodDraft(e.target.value)}
                className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                <option value="">Select payment method…</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={String(pm.id)}>
                    {pm.name}
                  </option>
                ))}
              </select>
              {canEditAppointments ? (
                <button
                  type="button"
                  disabled={patchLoading || paymentMethods.length === 0}
                  onClick={() => void updatePaymentPreference(paymentMethodDraft)}
                  className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
                >
                  Save payment details
                </button>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current method: {a.paymentMethod?.name ?? "—"}
            </p>
          </div>
          {canEditAppointments && a.status === "scheduled" && paymentMethods.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No active payment methods found. Add them under Settings → Payment methods (requires a linked finance account).
            </p>
          ) : null}

          {canEditAppointments && a.status === "scheduled" && (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-800/50">
              <div>
                <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Nudge time</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={patchLoading}
                    onClick={() => void shiftDayBy(-1)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    −1 day
                  </button>
                  <button
                    type="button"
                    disabled={patchLoading}
                    onClick={() => void shiftDayBy(1)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    +1 day
                  </button>
                  <button
                    type="button"
                    disabled={patchLoading}
                    onClick={() => void shiftTimeBy(-slotMinutes)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    −{slotMinutes} min
                  </button>
                  <button
                    type="button"
                    disabled={patchLoading}
                    onClick={() => void shiftTimeBy(slotMinutes)}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    +{slotMinutes} min
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Quick moves. Time stays within 00:00–23:59 on the same day unless you change the date with ±1 day.
                </p>
              </div>

              <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Reschedule</p>
                <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Set a new date and start/end times ({slotMinutes}-minute steps from Settings).
                </p>
                <div className="space-y-3">
                  <DateField
                    id="reschedule-date"
                    label="Date"
                    value={rescheduleDate}
                    onChange={setRescheduleDate}
                    disabled={patchLoading}
                    appendToBody
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Branch</label>
                      <select
                        value={editBranchId}
                        disabled={patchLoading}
                        onChange={(e) => setEditBranchId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={String(b.id)}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Doctor</label>
                      <select
                        value={editDoctorId}
                        disabled={patchLoading}
                        onChange={(e) => setEditDoctorId(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        {doctors.map((d) => (
                          <option key={d.id} value={String(d.id)}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reschedule-start" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                        Start time
                      </label>
                      <select
                        id="reschedule-start"
                        value={rescheduleStart}
                        disabled={patchLoading}
                        onChange={(e) => setRescheduleStart(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        {rescheduleTimeOptions.map((t) => {
                          const endFor = addMinutesToHHmm(t, rescheduleDurationMin);
                          const blocked =
                            !!appointment &&
                            /^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate) &&
                            (endFor == null ||
                              isIntervalBlocked(t, endFor, scheduleBlocks, rescheduleDate, appointment.branch.id));
                          return (
                            <option key={t} value={t} disabled={blocked}>
                              {blocked ? `${t} — blocked` : t}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reschedule-end" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                        End time
                      </label>
                      <select
                        id="reschedule-end"
                        value={rescheduleEnd}
                        disabled={patchLoading}
                        onChange={(e) => setRescheduleEnd(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      >
                        {rescheduleTimeOptions.map((t) => {
                          const sm = parseTimeToMinutes(rescheduleStart);
                          const em = parseTimeToMinutes(t);
                          const beforeOrEqualStart = sm != null && em != null && em <= sm;
                          const blocked =
                            !!appointment &&
                            /^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate) &&
                            (beforeOrEqualStart ||
                              isIntervalBlocked(
                                rescheduleStart,
                                t,
                                scheduleBlocks,
                                rescheduleDate,
                                appointment.branch.id
                              ));
                          return (
                            <option key={`e-${t}`} value={t} disabled={blocked}>
                              {blocked && !beforeOrEqualStart ? `${t} — blocked` : t}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Services</label>
                    <select
                      value={servicePick}
                      disabled={patchLoading}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) addEditableService(v);
                        setServicePick("");
                      }}
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    >
                      <option value="">Add service…</option>
                      {serviceCatalog
                        .filter((s) => !editServices.some((x) => x.serviceId === s.id))
                        .map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                    {editServices.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {editServices.map((s) => (
                          <div key={s.serviceId} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                            <span className="text-xs">{s.name}</span>
                            <button
                              type="button"
                              disabled={patchLoading}
                              className="text-xs text-error-600 hover:underline"
                              onClick={() => setEditServices((rows) => rows.filter((r) => r.serviceId !== s.serviceId))}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {appointment &&
                    /^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate) &&
                    scheduleBlocks.some((b) =>
                      blockAppliesToBookingDay(b, rescheduleDate, Number(editBranchId) || appointment.branch.id)
                    ) && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Times that fall in branch closed hours are unavailable.
                      </p>
                    )}
                  <button
                    type="button"
                    disabled={patchLoading}
                    onClick={() => void applyReschedule()}
                    className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
                  >
                    Save new schedule
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-3 dark:border-gray-600">
                <button
                  type="button"
                  disabled={patchLoading}
                  onClick={() => void cancelAppointment()}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Cancel booking
                </button>
                <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Marks the visit as cancelled. It remains visible on the calendar for your records.
                </p>
              </div>
            </div>
          )}

          {(a.sales?.length ?? 0) > 0 && (
            <div className="space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="font-medium text-gray-800 dark:text-gray-200">Sales for this booking</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                {(a.sales ?? []).map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-mono text-xs text-gray-500">#{s.id}</span>
                      <span className="mx-2 text-gray-400">·</span>
                      <span>{new Date(s.saleDate).toLocaleString()}</span>
                      <span className="mx-2 text-gray-400">·</span>
                      <span className="font-medium">${s.totalAmount.toFixed(2)}</span>
                      {s.discount > 0 ? (
                        <span className="text-gray-600 dark:text-gray-400">
                          <span className="mx-2 text-gray-400">·</span>discount −${s.discount.toFixed(2)}
                        </span>
                      ) : null}
                      <span className="mx-2 text-gray-400">·</span>
                      <span>{s.paymentMethod}</span>
                      {s.kind === "appointment" ? (
                        <span className="ml-2 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-800 dark:text-brand-200">
                          Visit billing
                        </span>
                      ) : null}
                      {s.depositTransaction?.id ? (
                        <span className="ml-2 text-[11px] text-emerald-700 dark:text-emerald-400">Deposited</span>
                      ) : (
                        <span className="ml-2 text-[11px] text-gray-500">No till deposit</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hasPermission("pharmacy.view") || hasPermission("pharmacy.pos") ? (
                        <Link
                          href={`/pharmacy/pos?viewSale=${s.id}`}
                          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          View receipt
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {hasPermission("pharmacy.view") ? (
                <Link
                  href={`/pharmacy/sales?appointmentId=${a.id}`}
                  className="inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Open sales list (this booking only)
                </Link>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            {(hasPermission("patient_history.create") ||
              hasPermission("patient_history.view") ||
              hasPermission("forms.view")) && (
              <Link
                href={`/appointments/${a.id}/clinic-forms`}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
              >
                Clinic note
              </Link>
            )}
            {(hasPermission("lab.create") || hasPermission("lab.view")) && (
              <Link
                href={`/lab/orders/new?appointmentId=${a.id}&patientId=${a.patient.id}&doctorId=${a.doctor.id}`}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
              >
                Send to Lab
              </Link>
            )}
            {(hasPermission("prescriptions.create") || hasPermission("prescriptions.view")) && (
              <Link
                href={`/prescriptions?create=1&appointmentId=${a.id}&patientId=${a.patient.id}&doctorId=${a.doctor.id}&branchId=${a.branch.id}`}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
              >
                Create Prescription
              </Link>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
