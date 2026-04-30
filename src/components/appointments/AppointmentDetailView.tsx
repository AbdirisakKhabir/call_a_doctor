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
    service: { name: string; color: string | null };
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
  const [billingDiscount, setBillingDiscount] = useState("");
  const [scheduleBlocks, setScheduleBlocks] = useState<ClientScheduleBlock[]>([]);

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
  }, [appointment, slotMinutes]);

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
    if (appointment.totalAmount > 0 && !appointment.paymentMethod?.id) {
      window.alert("Choose a payment method before completing a billed visit.");
      return;
    }
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
    const r = await patchAppointment({
      appointmentDate: rescheduleDate,
      startTime: rescheduleStart,
      endTime: rescheduleEnd,
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

          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-gray-500">Payment method:</span>
            {canEditAppointments && a.status === "scheduled" ? (
              <select
                value={a.paymentMethod?.id ?? ""}
                disabled={patchLoading || paymentMethods.length === 0}
                onChange={(e) => void updatePaymentPreference(e.target.value)}
                className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">Select for visit billing…</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={String(pm.id)}>
                    {pm.name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{a.paymentMethod?.name ?? "—"}</span>
            )}
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
                  {appointment &&
                    /^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate) &&
                    scheduleBlocks.some((b) => blockAppliesToBookingDay(b, rescheduleDate, appointment.branch.id)) && (
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

          <p>
            <span className="text-gray-500">Location (branch):</span> {a.branch.name}
          </p>
          <p>
            <span className="text-gray-500">Practitioner:</span> {a.doctor.name}
            {a.doctor.specialty ? ` · ${a.doctor.specialty}` : ""}
          </p>
          <p>
            <span className="text-gray-500">Client:</span> {a.patient.name} ({a.patient.patientCode})
          </p>
          <p>
            <span className="text-gray-500">Status:</span> {a.status}
          </p>
          {a.services.length > 0 && (
            <div>
              <p className="mb-1 text-gray-500">Service(s) booked:</p>
              <ul className="list-inside list-disc text-sm">
                {a.services.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {s.service.color ? (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: s.service.color }}
                        title={s.service.color}
                      />
                    ) : null}
                    <span>
                      {s.service.name} x{s.quantity} @ ${s.unitPrice.toFixed(2)} = ${s.totalAmount.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 font-semibold">Total: ${a.totalAmount.toFixed(2)}</p>
            </div>
          )}
          {canEditAppointments && a.status === "scheduled" && (
            <div className="rounded-lg border border-brand-200 bg-brand-500/5 p-3 dark:border-brand-800 dark:bg-brand-500/10">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200">Complete visit</p>
              {a.totalAmount > 0 ? (
                <div className="mt-2 space-y-1">
                  <label htmlFor="visit-billing-discount" className="block text-[11px] text-gray-600 dark:text-gray-400">
                    Billing discount ($) — optional, applied before recording payment
                  </label>
                  <input
                    id="visit-billing-discount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={billingDiscount}
                    disabled={patchLoading}
                    onChange={(e) => setBillingDiscount(e.target.value)}
                    className="h-9 w-full max-w-[200px] rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
              ) : null}
              {a.totalAmount > 0 && !a.paymentMethod?.id ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Choose a payment method above to record visit billing when you complete this booking.
                </p>
              ) : null}
              <button
                type="button"
                disabled={patchLoading || (a.totalAmount > 0 && !a.paymentMethod?.id)}
                onClick={() => void completeVisit()}
                className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                Mark visit complete
              </button>
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
