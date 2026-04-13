"use client";

import React, { useEffect, useState, useMemo } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ArrowRightIcon, ChevronLeftIcon } from "@/icons";

type Appointment = {
  id: number;
  appointmentDate: string;
  startTime: string;
  endTime: string | null;
  status: string;
  totalAmount: number;
  branch: { id: number; name: string };
  doctor: { id: number; name: string; specialty: string | null };
  patient: { id: number; patientCode: string; name: string };
  services: { service: { name: string }; quantity: number; unitPrice: number; totalAmount: number }[];
};

export default function AppointmentsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"view" | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = firstDay;
  const totalCells = Math.ceil((prevMonthDays + daysInMonth) / 7) * 7;

  const calendarDays = useMemo(() => {
    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevDaysInMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    for (let i = 0; i < prevMonthDays; i++) {
      const d = prevDaysInMonth - prevMonthDays + i + 1;
      days.push({
        date: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        isCurrentMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        isCurrentMonth: true,
      });
    }
    const remaining = totalCells - days.length;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`,
        day: i,
        isCurrentMonth: false,
      });
    }
    return days.slice(0, totalCells);
  }, [year, month, firstDay, daysInMonth, prevMonthDays, totalCells]);

  const weeksInMonth = useMemo(() => {
    const chunks: (typeof calendarDays)[] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      chunks.push(calendarDays.slice(i, i + 7));
    }
    return chunks;
  }, [calendarDays]);

  function formatWeekRangeLabel(week: { date: string }[]) {
    if (week.length === 0) return "";
    const start = new Date(week[0].date + "T12:00:00");
    const end = new Date(week[week.length - 1].date + "T12:00:00");
    if (week[0].date === week[week.length - 1].date) {
      return start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const d = a.appointmentDate.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return map;
  }, [appointments]);

  async function loadAppointments() {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = new Date(year, month + 1, 0);
    const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const res = await authFetch(`/api/appointments?startDate=${start}&endDate=${endStr}`);
    if (res.ok) setAppointments(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    loadAppointments().finally(() => setLoading(false));
  }, [year, month]);

  function openView(apt: Appointment) {
    setSelectedAppointment(apt);
    setModal("view");
  }

  function goNewAppointment(date: string) {
    router.push(`/appointments/new?date=${encodeURIComponent(date)}`);
  }

  const monthName = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Appointments (calendar)" />
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Link
              href="/appointments/new"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              New appointment
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 }))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="min-w-[180px] text-center font-semibold">{monthName}</span>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 }))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="border-r border-gray-200 py-2 text-center text-xs font-semibold text-gray-500 last:border-r-0 dark:border-gray-700">
                  {d}
                </div>
              ))}
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {weeksInMonth.map((week, weekIndex) => (
                <div key={week[0]?.date ?? weekIndex} className="bg-white dark:bg-gray-900/20">
                  <div className="border-b border-gray-100 bg-gray-50/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400">
                    Week {weekIndex + 1} · {formatWeekRangeLabel(week)}
                  </div>
                  <div className="grid grid-cols-7">
                    {week.map((cell) => {
                      const dayApts = appointmentsByDate[cell.date] || [];
                      const isBooked = dayApts.length > 0;
                      const isToday = cell.date === new Date().toISOString().slice(0, 10);
                      const baseBg = cell.isCurrentMonth
                        ? isBooked
                          ? "bg-emerald-50/90 dark:bg-emerald-500/10"
                          : "bg-white dark:bg-gray-900"
                        : isBooked
                          ? "bg-emerald-50/50 dark:bg-emerald-500/5"
                          : "bg-gray-50 dark:bg-gray-800/50";
                      return (
                        <div
                          key={cell.date}
                          onClick={() => canCreate && goNewAppointment(cell.date)}
                          className={`min-h-[140px] cursor-pointer border-b border-r border-gray-200 p-2 last:border-r-0 dark:border-gray-700 ${baseBg} hover:bg-brand-50/50 dark:hover:bg-brand-500/5 transition-colors`}
                        >
                          <div className={`flex items-center gap-1 text-sm font-medium ${cell.isCurrentMonth ? "text-gray-800 dark:text-white" : "text-gray-400"}`}>
                            {cell.day}
                            {isToday && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 dark:bg-brand-400" title="Today" />}
                          </div>
                          <div className="mt-1 max-h-[140px] min-h-[80px] space-y-1 overflow-y-auto">
                            {dayApts.map((apt) => (
                              <div
                                key={apt.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openView(apt);
                                }}
                                className={`cursor-pointer truncate rounded px-1.5 py-0.5 text-xs shrink-0 ${
                                  apt.status === "completed"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : apt.status === "cancelled"
                                      ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                      : "bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-400"
                                }`}
                              >
                                {apt.startTime} {apt.patient.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-xs dark:border-gray-700">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
                Available
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/20" />
                Booked
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                Today
              </span>
              {canCreate && <span className="text-gray-500 dark:text-gray-400">Click a day to open the new appointment form with that date.</span>}
            </div>
          </>
        )}
      </div>

      {modal === "view" && selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Appointment summary</h2>
              <button type="button" onClick={() => setModal(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                ×
              </button>
            </div>
            <div className="space-y-3 px-6 py-5">
              <p>
                <span className="text-gray-500">Date:</span> {selectedAppointment.appointmentDate.slice(0, 10)}
              </p>
              <p>
                <span className="text-gray-500">Time &amp; duration:</span> {selectedAppointment.startTime}
                {selectedAppointment.endTime ? ` – ${selectedAppointment.endTime}` : ""}
              </p>
              <p>
                <span className="text-gray-500">Location (branch):</span> {selectedAppointment.branch.name}
              </p>
              <p>
                <span className="text-gray-500">Practitioner:</span> {selectedAppointment.doctor.name}
                {selectedAppointment.doctor.specialty ? ` · ${selectedAppointment.doctor.specialty}` : ""}
              </p>
              <p>
                <span className="text-gray-500">Patient (client):</span> {selectedAppointment.patient.name} ({selectedAppointment.patient.patientCode})
              </p>
              <p>
                <span className="text-gray-500">Status:</span> {selectedAppointment.status}
              </p>
              {selectedAppointment.services.length > 0 && (
                <div>
                  <p className="mb-1 text-gray-500">Service(s) booked:</p>
                  <ul className="list-inside list-disc text-sm">
                    {selectedAppointment.services.map((s, i) => (
                      <li key={i}>
                        {s.service.name} x{s.quantity} @ ${s.unitPrice.toFixed(2)} = ${s.totalAmount.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 font-semibold">Total: ${selectedAppointment.totalAmount.toFixed(2)}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                {(hasPermission("patient_history.create") || hasPermission("patient_history.view")) && (
                  <Link
                    href={`/patients?history=1&patientId=${selectedAppointment.patient.id}&appointmentId=${selectedAppointment.id}`}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
                  >
                    Clinical note
                  </Link>
                )}
                {(hasPermission("lab.create") || hasPermission("lab.view")) && (
                  <Link
                    href={`/lab/orders?create=1&appointmentId=${selectedAppointment.id}&patientId=${selectedAppointment.patient.id}&doctorId=${selectedAppointment.doctor.id}`}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
                  >
                    Send to Lab
                  </Link>
                )}
                {(hasPermission("prescriptions.create") || hasPermission("prescriptions.view")) && (
                  <Link
                    href={`/prescriptions?create=1&appointmentId=${selectedAppointment.id}&patientId=${selectedAppointment.patient.id}&doctorId=${selectedAppointment.doctor.id}&branchId=${selectedAppointment.branch.id}`}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600"
                  >
                    Create Prescription
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
