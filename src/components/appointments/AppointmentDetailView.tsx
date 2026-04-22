"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import DateField from "@/components/form/DateField";
import { authFetch } from "@/lib/api";
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
  branch: { id: number; name: string };
  doctor: { id: number; name: string; specialty: string | null };
  patient: { id: number; patientCode: string; name: string };
  services: {
    service: { name: string; color: string | null };
    quantity: number;
    unitPrice: number;
    totalAmount: number;
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

  async function patchAppointment(body: Record<string, unknown>): Promise<boolean> {
    setPatchLoading(true);
    try {
      const res = await authFetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AppointmentDetail & { error?: string };
      if (!res.ok) return false;
      setAppointment(data);
      return true;
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

  async function cancelAppointment() {
    if (!appointment || !canEditAppointments) return;
    if (
      !window.confirm(
        "Cancel this booking? It will stay on the calendar as cancelled; you can book someone else in this slot."
      )
    ) {
      return;
    }
    const ok = await patchAppointment({ status: "cancelled" });
    if (ok) router.push("/appointments");
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
    const ok = await patchAppointment({
      appointmentDate: rescheduleDate,
      startTime: rescheduleStart,
      endTime: rescheduleEnd,
    });
    if (!ok) window.alert("Could not reschedule. Check permissions or try again.");
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
    await patchAppointment({ startTime: newStart, endTime: newEnd });
  }

  async function shiftDayBy(days: number) {
    if (!appointment || !canEditAppointments) return;
    const iso = appointment.appointmentDate.slice(0, 10);
    const newDate = addCalendarDaysIso(iso, days);
    await patchAppointment({ appointmentDate: newDate });
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
                        {rescheduleTimeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
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
                        {rescheduleTimeOptions.map((t) => (
                          <option key={`e-${t}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
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
          <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            {(hasPermission("patient_history.create") || hasPermission("patient_history.view")) && (
              <button
                type="button"
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
                onClick={() => {
                  void Swal.fire({
                    icon: "info",
                    title: "Sorry, please wait",
                    text: "We are working on note forms.",
                    confirmButtonText: "OK",
                    confirmButtonColor: "#465fff",
                  });
                }}
              >
                Clinic note
              </button>
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
