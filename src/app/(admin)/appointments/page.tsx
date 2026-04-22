"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ArrowRightIcon, ChevronLeftIcon } from "@/icons";
import { contrastingForeground } from "@/lib/service-color";
import {
  addCalendarDaysIso,
  appointmentDurationMinutes,
  DEFAULT_APPOINTMENT_DURATION_MIN,
  durationSlotRowCount,
  formatMinutesAsLabel,
  formatMinutesFromMidnightAs12h,
  formatSlotEndTime12hLabel,
  formatTime12hLabel,
  parseTimeToMinutes,
} from "@/lib/appointment-calendar-time";

type Appointment = {
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

function firstServiceColor(apt: Appointment): string | null {
  for (const line of apt.services) {
    const c = line.service.color;
    if (c && /^#[0-9A-Fa-f]{6}$/.test(c.trim())) return c.trim();
  }
  return null;
}

/** First minute shown in the day column (inclusive) — 6:00 AM. */
const CAL_DAY_START_MIN = 6 * 60;
/** End of visible day (exclusive) — 24:00; grid shows 06:00 through 23:45. */
const CAL_DAY_END_MIN = 24 * 60;
const CAL_START_HOUR = 6;
const CAL_END_HOUR = 24;
/** Pixel height of one calendar row (one slot step). */
const SLOT_PX = 28;

function dayTimelineHeightPx(slotMinutes: number): number {
  const slots = (CAL_DAY_END_MIN - CAL_DAY_START_MIN) / slotMinutes;
  return slots * SLOT_PX;
}

function appointmentTopPx(startTime: string, slotMinutes: number): number {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return 0;
  const clamped = Math.max(CAL_DAY_START_MIN, Math.min(start, CAL_DAY_END_MIN - 1));
  return ((clamped - CAL_DAY_START_MIN) / slotMinutes) * SLOT_PX;
}

/** Height from start/end: whole slot rows (30 min → 2 rows at 15-min slots; 60 min → 4 rows). */
function appointmentHeightPx(apt: Appointment, slotMinutes: number): number {
  const start = parseTimeToMinutes(apt.startTime);
  if (start == null) return durationSlotRowCount(DEFAULT_APPOINTMENT_DURATION_MIN, slotMinutes) * SLOT_PX;
  const dur = appointmentDurationMinutes(apt.startTime, apt.endTime);
  const endMin = start + dur;
  const vStart = Math.max(start, CAL_DAY_START_MIN);
  const vEnd = Math.min(endMin, CAL_DAY_END_MIN);
  if (vEnd <= vStart) return SLOT_PX;
  const durVisible = vEnd - vStart;
  const rows = durationSlotRowCount(durVisible, slotMinutes);
  return rows * SLOT_PX;
}

function sortByStartTime(a: Appointment, b: Appointment): number {
  const ma = parseTimeToMinutes(a.startTime) ?? 0;
  const mb = parseTimeToMinutes(b.startTime) ?? 0;
  return ma - mb;
}

/** Comma-separated service names for calendar cards. */
function formatServicesForCalendar(apt: Appointment): string {
  if (!apt.services.length) return "No service listed";
  return apt.services.map((s) => s.service.name).join(", ");
}

/** Inner width of the time labels (12h text needs a bit more room). */
const TIME_GUTTER_PX = 76;
/** Total width of the sticky time column including horizontal padding (same as day cells). */
const timeGutterTotalWidth = `calc(${TIME_GUTTER_PX}px + 0.75rem)`;
/** Minimum width per day column — wider columns + horizontal scroll when the viewport is narrower. */
const MIN_DAY_COLUMN_PX = 220;
const MIN_DAY_COLUMN_DAY_VIEW_PX = 320;

type CalendarViewMode = "month" | "week" | "day";

type CalendarDayCell = { date: string; day: number; isCurrentMonth: boolean };

function startOfWeekSundayFromIso(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function buildWeekCells(weekStartIso: string, refYear: number, refMonth: number): CalendarDayCell[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addCalendarDaysIso(weekStartIso, i);
    const dt = new Date(iso + "T12:00:00");
    return {
      date: iso,
      day: dt.getDate(),
      isCurrentMonth: dt.getFullYear() === refYear && dt.getMonth() === refMonth,
    };
  });
}

function dayColumnsTemplate(viewMode: CalendarViewMode): string {
  if (viewMode === "day") return `minmax(${MIN_DAY_COLUMN_DAY_VIEW_PX}px, 1fr)`;
  return `repeat(7, minmax(${MIN_DAY_COLUMN_PX}px, 1fr))`;
}

function weekRowMinWidthForView(viewMode: CalendarViewMode): string {
  if (viewMode === "day") {
    return `calc(${TIME_GUTTER_PX}px + 0.75rem + ${MIN_DAY_COLUMN_DAY_VIEW_PX}px)`;
  }
  return `calc(${TIME_GUTTER_PX}px + 0.75rem + ${7 * MIN_DAY_COLUMN_PX}px)`;
}

function DayColumnHeader({
  isoDate,
  viewMode,
  isToday,
}: {
  isoDate: string;
  viewMode: CalendarViewMode;
  isToday: boolean;
}) {
  const d = new Date(isoDate + "T12:00:00");
  const weekday =
    viewMode === "day"
      ? d.toLocaleDateString(undefined, { weekday: "long" })
      : d.toLocaleDateString(undefined, { weekday: "short" });
  const dateLine =
    viewMode === "day"
      ? d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center gap-0.5 border-r border-gray-200 px-1 py-2 text-center last:border-r-0 dark:border-gray-700 ${
        isToday ? "bg-brand-50/90 dark:bg-brand-950/30" : "bg-gray-50/80 dark:bg-gray-900/50"
      }`}
    >
      <span
        className={`text-xs font-semibold sm:text-sm ${isToday ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-gray-100"}`}
      >
        {weekday}
      </span>
      <span className="text-[11px] leading-tight text-gray-600 dark:text-gray-400">{dateLine}</span>
      {isToday && <span className="sr-only">(today)</span>}
    </div>
  );
}

function TimeGutterColumn({ slotMinutes }: { slotMinutes: number }) {
  const rowStarts: number[] = [];
  for (let m = CAL_DAY_START_MIN; m < CAL_DAY_END_MIN; m += slotMinutes) {
    rowStarts.push(m);
  }
  const timelineH = rowStarts.length * SLOT_PX;
  return (
    <div className="relative shrink-0" style={{ width: TIME_GUTTER_PX, height: timelineH }}>
      {rowStarts.map((startMin, i) => {
        const label = formatMinutesFromMidnightAs12h(startMin);
        const min = startMin % 60;
        const isHourStart = min === 0;
        return (
          <div
            key={startMin}
            className="pointer-events-none absolute left-0 right-0 flex items-start justify-end border-b border-gray-100 dark:border-gray-800"
            style={{ top: i * SLOT_PX, height: SLOT_PX }}
          >
            <span
              className={`max-w-[4.5rem] pr-1.5 pt-0.5 text-right text-[10px] leading-tight tabular-nums ${
                isHourStart
                  ? "font-semibold text-gray-700 dark:text-gray-200"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AppointmentsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  /** Hovered slot: label + vertical center within the day timeline (shown on that row, not only at top). */
  const [hoverSlotByDate, setHoverSlotByDate] = useState<
    Record<string, { label: string; topPx: number } | null>
  >({});
  /** Horizontal scrollport for the calendar grid (paired with vertical-only inner scroll). */
  const calendarHScrollRef = useRef<HTMLDivElement>(null);
  const [slotMinutes, setSlotMinutes] = useState<15 | 30>(15);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  /** Focus date for week/day views (ISO YYYY-MM-DD). */
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));

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
    const chunks: CalendarDayCell[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      chunks.push(calendarDays.slice(i, i + 7));
    }
    return chunks;
  }, [calendarDays]);

  const weeksToRender = useMemo(() => {
    if (viewMode === "month") return weeksInMonth;
    if (viewMode === "week") {
      const ws = startOfWeekSundayFromIso(anchorDate);
      const ref = new Date(anchorDate + "T12:00:00");
      return [buildWeekCells(ws, ref.getFullYear(), ref.getMonth())];
    }
    const dt = new Date(anchorDate + "T12:00:00");
    return [
      [
        {
          date: anchorDate,
          day: dt.getDate(),
          isCurrentMonth: dt.getFullYear() === year && dt.getMonth() === month,
        },
      ],
    ];
  }, [viewMode, weeksInMonth, anchorDate, year, month]);

  /** Keep month picker aligned when moving week/day across month boundaries. */
  useEffect(() => {
    if (viewMode !== "week" && viewMode !== "day") return;
    const d = new Date(anchorDate + "T12:00:00");
    setCurrentMonth((prev) => {
      if (prev.year === d.getFullYear() && prev.month === d.getMonth()) return prev;
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, [anchorDate, viewMode]);

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
    let startStr: string;
    let endStr: string;
    if (viewMode === "month") {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const end = new Date(year, month + 1, 0);
      startStr = start;
      endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    } else if (viewMode === "week") {
      const ws = startOfWeekSundayFromIso(anchorDate);
      startStr = ws;
      endStr = addCalendarDaysIso(ws, 6);
    } else {
      startStr = anchorDate;
      endStr = anchorDate;
    }
    const res = await authFetch(`/api/appointments?startDate=${startStr}&endDate=${endStr}`);
    if (res.ok) setAppointments(await res.json());
  }

  useEffect(() => {
    setLoading(true);
    loadAppointments().finally(() => setLoading(false));
  }, [year, month, viewMode, anchorDate]);

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

  /** Scroll the week that contains today's date into view when opening the list or changing month. */
  useEffect(() => {
    if (loading) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayInGrid = weeksToRender.some((w) => w.some((c) => c.date === today));
    if (!todayInGrid) return;
    const t = window.setTimeout(() => {
      document.getElementById("calendar-week-containing-today")?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [loading, year, month, viewMode, anchorDate, weeksToRender]);

  function goToAppointment(apt: Appointment) {
    router.push(`/appointments/${apt.id}`);
  }

  function goNewAppointment(date: string) {
    router.push(`/appointments/new?date=${encodeURIComponent(date)}`);
  }

  const monthName = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
  const monthInputValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const todayDateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  /** Calendar grid uses local "today" for week highlight + scroll (recomputed each render). */
  const todayIso = new Date().toISOString().slice(0, 10);

  function onMonthPickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    const [yStr, mStr] = v.split("-");
    const y = Number(yStr);
    const mo = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return;
    setCurrentMonth({ year: y, month: mo - 1 });
    if (viewMode !== "month") {
      setAnchorDate(`${y}-${String(mo).padStart(2, "0")}-01`);
    }
  }

  function calendarNavPrevious() {
    if (viewMode === "month") {
      setCurrentMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 }));
    } else if (viewMode === "week") {
      setAnchorDate((d) => addCalendarDaysIso(d, -7));
    } else {
      setAnchorDate((d) => addCalendarDaysIso(d, -1));
    }
  }

  function calendarNavNext() {
    if (viewMode === "month") {
      setCurrentMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 }));
    } else if (viewMode === "week") {
      setAnchorDate((d) => addCalendarDaysIso(d, 7));
    } else {
      setAnchorDate((d) => addCalendarDaysIso(d, 1));
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-3 shrink-0 sm:mb-4">
        <PageBreadCrumb pageTitle="Calendar" />
      </div>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3">
        {/* Filter / control bar: stays at top of calendar panel, full width (does not scroll with grid). */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/95 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/50 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              title={viewMode === "month" ? "Previous month" : viewMode === "week" ? "Previous week" : "Previous day"}
              onClick={calendarNavPrevious}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <label htmlFor="calendar-month-filter" className="sr-only">
                Select month
              </label>
              <input
                id="calendar-month-filter"
                type="month"
                value={monthInputValue}
                onChange={onMonthPickerChange}
                className="h-9 min-w-0 max-w-[11rem] rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
              <span className="hidden truncate text-sm font-medium text-gray-600 dark:text-gray-300 sm:inline">{monthName}</span>
            </div>
            <button
              type="button"
              title={viewMode === "month" ? "Next month" : viewMode === "week" ? "Next week" : "Next day"}
              onClick={calendarNavNext}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ArrowRightIcon className="h-5 w-5" />
            </button>
            <div className="ml-0 flex min-w-0 max-w-full flex-col justify-center sm:ml-1 sm:max-w-[min(100%,20rem)]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Today</span>
              <span className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100" title={todayDateLabel}>
                {todayDateLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div
              className="flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-900"
              role="group"
              aria-label="Calendar view"
            >
              {(["month", "week", "day"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                    viewMode === m
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {m === "month" ? "Month" : m === "week" ? "Week" : "Day"}
                </button>
              ))}
            </div>
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{slotMinutes} min grid</span>
            {canCreate && (
              <Link
                href="/appointments/new"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500"
              >
                New booking
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
          </div>
        ) : (
          <>
            {/*
              Split scroll: outer = horizontal only, inner = vertical only.
              A single element with overflow-x + overflow-y makes trackpads prioritize vertical
              until the bottom; separating fixes sliding sideways from the top of the calendar.
            */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div
                ref={calendarHScrollRef}
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
              >
                <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ minWidth: weekRowMinWidthForView(viewMode) }}>
                  <div
                    className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch]"
                    onWheel={(e) => {
                      const h = calendarHScrollRef.current;
                      if (!h) return;
                      // Route mostly-horizontal wheel / trackpad to the horizontal scroller (works at any vertical scroll position).
                      const absX = Math.abs(e.deltaX);
                      const absY = Math.abs(e.deltaY);
                      if (absX > 4 && absX >= absY * 1.25) {
                        h.scrollLeft += e.deltaX;
                        e.preventDefault();
                        return;
                      }
                      if (e.shiftKey && absY > 0) {
                        h.scrollLeft += e.deltaY;
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {weeksToRender.map((week, weekIndex) => {
                  const weekHasToday = week.some((c) => c.date === todayIso);
                  return (
                  <div
                    key={week[0]?.date ?? weekIndex}
                    id={weekHasToday ? "calendar-week-containing-today" : undefined}
                    className="bg-white dark:bg-gray-900/20"
                  >
                    <div className="border-b border-gray-100 bg-gray-50/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-400">
                      {viewMode === "month" ? `Week ${weekIndex + 1} · ` : ""}
                      {formatWeekRangeLabel(week)}
                    </div>
                    <div
                      className="flex w-full shrink-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/30"
                      style={{ minWidth: weekRowMinWidthForView(viewMode) }}
                    >
                      <div
                        className="flex shrink-0 items-center justify-center border-r border-gray-200 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400"
                        style={{ width: timeGutterTotalWidth }}
                      >
                        Time
                      </div>
                      <div
                        className="grid min-w-0 flex-1"
                        style={{ gridTemplateColumns: dayColumnsTemplate(viewMode) }}
                      >
                        {week.map((cell) => (
                          <DayColumnHeader
                            key={cell.date}
                            isoDate={cell.date}
                            viewMode={viewMode}
                            isToday={cell.date === todayIso}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex w-full" style={{ minWidth: weekRowMinWidthForView(viewMode) }}>
                      <div
                        className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-[2px_0_8px_-2px_rgba(0,0,0,0.35)]"
                        style={{ width: timeGutterTotalWidth }}
                      >
                        <div className="flex min-h-[200px] flex-col border-b border-gray-200 p-1.5 dark:border-gray-700">
                          <div className="pointer-events-none flex shrink-0 items-center gap-1 px-0.5 text-sm font-medium text-transparent select-none" aria-hidden>
                            <span>00</span>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-0" />
                          </div>
                          <div className="mt-1 flex-1">
                            <div className="rounded-lg border border-gray-200/80 bg-white/90 dark:border-gray-700 dark:bg-gray-950/40">
                              <TimeGutterColumn slotMinutes={slotMinutes} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div
                        className="grid min-w-0 flex-1"
                        style={{ gridTemplateColumns: dayColumnsTemplate(viewMode) }}
                      >
                      {week.map((cell) => {
                      const dayApts = (appointmentsByDate[cell.date] || []).slice().sort(sortByStartTime);
                      const isBooked = dayApts.length > 0;
                      const baseBg = cell.isCurrentMonth
                        ? isBooked
                          ? "bg-emerald-50/90 dark:bg-emerald-500/10"
                          : "bg-white dark:bg-gray-900"
                        : isBooked
                          ? "bg-emerald-50/50 dark:bg-emerald-500/5"
                          : "bg-gray-50 dark:bg-gray-800/50";
                      const timelineH = dayTimelineHeightPx(slotMinutes);
                      const slotCount = (CAL_DAY_END_MIN - CAL_DAY_START_MIN) / slotMinutes;
                      return (
                        <div
                          key={cell.date}
                          onClick={() => canCreate && goNewAppointment(cell.date)}
                          className={`flex min-h-[220px] min-w-0 cursor-pointer flex-col border-b border-r border-gray-200 p-1.5 pt-1 last:border-r-0 dark:border-gray-700 ${baseBg} hover:bg-brand-50/50 dark:hover:bg-brand-500/5 transition-colors`}
                        >
                          <div className="flex-1">
                            <div className="rounded-lg border border-gray-200/80 bg-white/90 dark:border-gray-700 dark:bg-gray-950/40">
                              <div className="relative overflow-visible" style={{ minHeight: timelineH }}>
                                {Array.from({ length: slotCount }, (_, slotIdx) => {
                                  const startMin = CAL_DAY_START_MIN + slotIdx * slotMinutes;
                                  const rowLabel = formatSlotEndTime12hLabel(startMin, slotMinutes);
                                  const rowCenterPx = slotIdx * SLOT_PX + SLOT_PX / 2;
                                  return (
                                    <div
                                      key={startMin}
                                      style={{ top: slotIdx * SLOT_PX, height: SLOT_PX }}
                                      title={rowLabel}
                                      onMouseEnter={() =>
                                        setHoverSlotByDate((prev) => ({
                                          ...prev,
                                          [cell.date]: { label: rowLabel, topPx: rowCenterPx },
                                        }))
                                      }
                                      onMouseLeave={() =>
                                        setHoverSlotByDate((prev) => ({ ...prev, [cell.date]: null }))
                                      }
                                      className="pointer-events-auto absolute left-0 right-0 border-b border-gray-200/80 bg-gray-50/40 hover:bg-brand-400/25 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:bg-brand-500/30"
                                    />
                                  );
                                })}
                                <div
                                  className="pointer-events-none absolute left-0 right-0 top-0 z-[1]"
                                  style={{ height: timelineH }}
                                >
                                  {dayApts.map((apt, aptIndex) => {
                                    const dur = appointmentDurationMinutes(apt.startTime, apt.endTime);
                                    const svcColor = firstServiceColor(apt);
                                    const top = appointmentTopPx(apt.startTime, slotMinutes);
                                    const durationPx = appointmentHeightPx(apt, slotMinutes);
                                    const maxDownPx = Math.max(0, timelineH - top);
                                    const minH = Math.min(durationPx, maxDownPx || durationPx);
                                    const cardStyle: React.CSSProperties = {
                                      top,
                                      minHeight: minH,
                                      maxHeight: maxDownPx,
                                      height: "auto",
                                      zIndex: 4 + aptIndex,
                                    };
                                    const baseCard =
                                      "pointer-events-auto absolute left-0 right-0 flex cursor-pointer flex-col overflow-hidden rounded-md border px-2 py-1.5 text-left shadow-md ring-1 ring-black/5 dark:ring-white/10";
                                    const servicesText = formatServicesForCalendar(apt);
                                    const titleLine = `${formatTime12hLabel(apt.startTime)} — ${apt.patient.name.toUpperCase()}`;

                                    const cardInner = (
                                      <div className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-4 text-left [-webkit-overflow-scrolling:touch]">
                                        <span
                                          className="pointer-events-none absolute top-1.5 right-1 shrink-0 opacity-70"
                                          aria-hidden
                                        >
                                          <svg
                                            viewBox="0 0 24 24"
                                            className="h-3 w-3"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinejoin="round"
                                          >
                                            <path d="M12 2.5l2.2 6.8h7.1l-5.7 4.4 2.2 6.8L12 16.9 6.2 20.5l2.2-6.8L2.7 9.3h7.1L12 2.5z" />
                                          </svg>
                                        </span>
                                        <span className="break-words text-[10px] font-extrabold uppercase leading-snug tracking-tight">
                                          {titleLine}
                                        </span>
                                        <span className="break-words text-[10px] font-normal leading-snug opacity-95">
                                          {servicesText}
                                        </span>
                                        <span className="mt-auto shrink-0 text-[9px] font-medium opacity-75">
                                          {formatMinutesAsLabel(dur)}
                                        </span>
                                      </div>
                                    );

                                    if (apt.status === "cancelled") {
                                      return (
                                        <button
                                          key={apt.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToAppointment(apt);
                                          }}
                                          className={`${baseCard} border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200`}
                                          style={cardStyle}
                                        >
                                          {cardInner}
                                        </button>
                                      );
                                    }
                                    if (svcColor) {
                                      return (
                                        <button
                                          key={apt.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            goToAppointment(apt);
                                          }}
                                          className={`${baseCard} ring-1 ring-black/10 dark:ring-white/10`}
                                          style={{
                                            ...cardStyle,
                                            backgroundColor: svcColor,
                                            color: contrastingForeground(svcColor),
                                            borderColor: "transparent",
                                          }}
                                        >
                                          {cardInner}
                                        </button>
                                      );
                                    }
                                    const done = apt.status === "completed";
                                    return (
                                      <button
                                        key={apt.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          goToAppointment(apt);
                                        }}
                                        className={
                                          done
                                            ? `${baseCard} border-green-200 bg-green-100 text-green-950 dark:border-green-800 dark:bg-green-900/35 dark:text-green-50`
                                            : `${baseCard} border-brand-200 bg-brand-100 text-brand-950 dark:border-brand-800 dark:bg-brand-900/35 dark:text-brand-50`
                                        }
                                        style={cardStyle}
                                      >
                                        {cardInner}
                                      </button>
                                    );
                                  })}
                                </div>
                                {(() => {
                                  const slotHover = hoverSlotByDate[cell.date];
                                  if (!slotHover) return null;
                                  return (
                                    <div
                                      className="pointer-events-none absolute left-1 right-1 z-[15] -translate-y-1/2 rounded-md border border-white/30 bg-brand-600 px-2 py-1 text-center font-mono text-[10px] font-bold text-white shadow-lg dark:bg-brand-500"
                                      style={{ top: slotHover.topPx }}
                                    >
                                      {slotHover.label}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                      })}
                      </div>
                    </div>
                  </div>
                );
                })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-xs dark:border-gray-700">
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
              {canCreate && (
                <span className="text-gray-500 dark:text-gray-400">
                  Time axis uses 12-hour times (from 6:00 AM). Use Month / Week / Day to change the layout; each column shows the weekday and date. Scroll vertically; in Month / Week slide sideways if needed (trackpad, scrollbar, or Shift + wheel).
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
