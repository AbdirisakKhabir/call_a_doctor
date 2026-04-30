"use client";

import React, { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ArrowRightIcon, ChevronLeftIcon } from "@/icons";
import { contrastingForeground } from "@/lib/service-color";
import {
  addCalendarDaysIso,
  APPOINTMENT_CALENDAR_SLOT_MINUTES,
  appointmentDurationMinutes,
  DEFAULT_APPOINTMENT_DURATION_MIN,
  durationSlotRowCount,
  formatMinutesAsLabel,
  formatMinutesFromMidnightAs24h,
  formatSlotEndTimeLabel,
  formatTime12hLabel,
  isAppointmentCalendarSlotMinutes,
  parseTimeToMinutes,
  type AppointmentCalendarSlotMinutes,
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

type PublishedFormListItem = {
  id: number;
  title: string;
  description: string | null;
  _count: { fields: number };
};

type CalendarQuickViewModal = {
  apt: Appointment;
  step: "detail" | "forms";
};

type ScheduleBlock = {
  id: number;
  branchId: number | null;
  branch: { id: number; name: string } | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  windows: { id: number; startTime: string; endTime: string; sortOrder: number }[];
  label: string | null;
  isActive: boolean;
};

function blockAppliesToDate(b: ScheduleBlock, isoDate: string): boolean {
  const s = b.startDate.slice(0, 10);
  const e = b.endDate.slice(0, 10);
  return isoDate >= s && isoDate <= e;
}

function blockSegmentHeightPx(startTime: string, endTime: string, slotMinutes: number): number {
  const a = parseTimeToMinutes(startTime);
  const b = parseTimeToMinutes(endTime);
  if (a == null || b == null || b <= a) return SLOT_PX;
  return durationSlotRowCount(b - a, slotMinutes) * SLOT_PX;
}

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

/** Half-open slot [slotStartMin, slotEndMin) overlaps a block row (same rules as booking overlap). */
function slotMinutesOverlapScheduleBlock(
  slotStartMin: number,
  slotEndMin: number,
  b: ScheduleBlock,
  isoDate: string
): boolean {
  if (b.isActive === false || !blockAppliesToDate(b, isoDate)) return false;
  if (b.allDay) return true;
  for (const w of b.windows ?? []) {
    const b1 = parseTimeToMinutes(w.startTime);
    const b2 = parseTimeToMinutes(w.endTime);
    if (b1 == null || b2 == null || b2 <= b1) continue;
    if (slotStartMin < b2 && slotEndMin > b1) return true;
  }
  return false;
}

function isCalendarSlotBlocked(
  cellDate: string,
  slotIdx: number,
  slotMinutes: number,
  blocks: ScheduleBlock[]
): boolean {
  const slotStartMin = CAL_DAY_START_MIN + slotIdx * slotMinutes;
  const slotEndMin = slotStartMin + slotMinutes;
  for (const b of blocks) {
    if (slotMinutesOverlapScheduleBlock(slotStartMin, slotEndMin, b, cellDate)) return true;
  }
  return false;
}

function calendarRangeTouchesBlockedSlot(
  cellDate: string,
  lo: number,
  hi: number,
  slotMinutes: number,
  blocks: ScheduleBlock[]
): boolean {
  for (let i = lo; i <= hi; i++) {
    if (isCalendarSlotBlocked(cellDate, i, slotMinutes, blocks)) return true;
  }
  return false;
}

function dayTimelineHeightPx(slotMinutes: number): number {
  const slots = (CAL_DAY_END_MIN - CAL_DAY_START_MIN) / slotMinutes;
  return slots * SLOT_PX;
}

function slotIndexFromClientY(timelineEl: HTMLElement, clientY: number, slotCount: number): number {
  const r = timelineEl.getBoundingClientRect();
  const y = clientY - r.top;
  return Math.max(0, Math.min(slotCount - 1, Math.floor(y / SLOT_PX)));
}

/** Inclusive slot indices [lo, hi] → booking start/end HH:mm for /appointments/new. */
function calendarDragRangeToBookingTimes(
  lo: number,
  hi: number,
  slotMinutes: number
): { start: string; end: string } {
  const startMin = CAL_DAY_START_MIN + lo * slotMinutes;
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  let end = formatSlotEndTimeLabel(CAL_DAY_START_MIN + hi * slotMinutes, slotMinutes);
  if (end === "24:00") end = "23:59";
  return { start, end };
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

/** Inner width of the time labels (HH:mm). */
const TIME_GUTTER_PX = 58;
/** Total width of the sticky time column including horizontal padding (same as day cells). */
const timeGutterTotalWidth = `calc(${TIME_GUTTER_PX}px + 0.75rem)`;
/** Minimum width per day column — wider columns + horizontal scroll when the viewport is narrower. */
const MIN_DAY_COLUMN_PX = 220;
const MIN_DAY_COLUMN_DAY_VIEW_PX = 320;

type CalendarViewMode = "month" | "week" | "day";

type CalendarDayCell = { date: string; day: number; isCurrentMonth: boolean };

/** First day of the week shown in week view: Saturday → … → Friday. */
function startOfWeekSaturdayFromIso(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const daysBack = (d.getDay() + 1) % 7;
  return addCalendarDaysIso(isoDate, -daysBack);
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
        const label = formatMinutesFromMidnightAs24h(startMin);
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
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  /** Hovered slot: label + vertical center within the day timeline (shown on that row, not only at top). */
  const [hoverSlotByDate, setHoverSlotByDate] = useState<
    Record<string, { label: string; topPx: number } | null>
  >({});
  /** Horizontal scrollport for the calendar grid (paired with vertical-only inner scroll). */
  const calendarHScrollRef = useRef<HTMLDivElement>(null);
  const calendarVScrollRef = useRef<HTMLDivElement>(null);
  const calendarInitialScrollResetDoneRef = useRef(false);
  const [slotMinutes, setSlotMinutes] = useState<AppointmentCalendarSlotMinutes>(15);
  const [slotStepSaving, setSlotStepSaving] = useState(false);
  const [slotStepError, setSlotStepError] = useState("");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  /** Focus date for week/day views (ISO YYYY-MM-DD). */
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  /** Drag preview when selecting a time range on the week/day grid (before navigating to new booking). */
  const [gridDragRange, setGridDragRange] = useState<{ date: string; lo: number; hi: number } | null>(null);
  const activeGridDragRef = useRef<{
    timeline: HTMLElement;
    date: string;
    anchorIdx: number;
    slotCount: number;
    slotMinutes: AppointmentCalendarSlotMinutes;
  } | null>(null);

  const canCreate = hasPermission("appointments.create") || hasPermission("appointments.view");
  const canManageSlotStep = hasPermission("settings.manage");
  const canOpenClinicForms =
    hasPermission("patient_history.create") ||
    hasPermission("patient_history.view") ||
    hasPermission("forms.view");

  const [calendarModal, setCalendarModal] = useState<CalendarQuickViewModal | null>(null);
  const [publishedForms, setPublishedForms] = useState<PublishedFormListItem[]>([]);
  const [formsListLoading, setFormsListLoading] = useState(false);

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
      const ws = startOfWeekSaturdayFromIso(anchorDate);
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

  const calendarSettingsFetched = useRef(false);

  function rangeForFetch(): { startStr: string; endStr: string } {
    if (viewMode === "month") {
      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const end = new Date(year, month + 1, 0);
      return {
        startStr: start,
        endStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
      };
    }
    if (viewMode === "week") {
      const ws = startOfWeekSaturdayFromIso(anchorDate);
      return { startStr: ws, endStr: addCalendarDaysIso(ws, 6) };
    }
    return { startStr: anchorDate, endStr: anchorDate };
  }

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const { startStr, endStr } = rangeForFetch();
    const blockUrl = `/api/settings/appointment-blocks?startDate=${encodeURIComponent(startStr)}&endDate=${encodeURIComponent(endStr)}`;
    const load = async () => {
      try {
        const apUrl = `/api/appointments?startDate=${startStr}&endDate=${endStr}`;
        if (calendarSettingsFetched.current) {
          const [apRes, blockRes] = await Promise.all([authFetch(apUrl), authFetch(blockUrl)]);
          if (cancelled) return;
          if (apRes.ok) setAppointments(await apRes.json());
          if (blockRes.ok) {
            const j = (await blockRes.json()) as { blocks?: ScheduleBlock[] };
            setScheduleBlocks(Array.isArray(j.blocks) ? j.blocks : []);
          } else setScheduleBlocks([]);
        } else {
          const [apRes, blockRes, calRes] = await Promise.all([
            authFetch(apUrl),
            authFetch(blockUrl),
            authFetch("/api/settings/appointment-calendar"),
          ]);
          if (cancelled) return;
          if (apRes.ok) setAppointments(await apRes.json());
          if (blockRes.ok) {
            const j = (await blockRes.json()) as { blocks?: ScheduleBlock[] };
            setScheduleBlocks(Array.isArray(j.blocks) ? j.blocks : []);
          } else setScheduleBlocks([]);
          if (calRes.ok) {
            calendarSettingsFetched.current = true;
            const data = (await calRes.json()) as { slotMinutes?: number };
            const n = data.slotMinutes;
            if (typeof n === "number" && isAppointmentCalendarSlotMinutes(n)) setSlotMinutes(n);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [year, month, viewMode, anchorDate]);

  useEffect(() => {
    if (!calendarModal || calendarModal.step !== "forms") return;
    let cancelled = false;
    setFormsListLoading(true);
    authFetch("/api/forms/published")
      .then(async (res) => {
        if (cancelled || !res.ok) {
          if (!cancelled) setPublishedForms([]);
          return;
        }
        const data = (await res.json()) as unknown;
        if (cancelled) return;
        setPublishedForms(Array.isArray(data) ? (data as PublishedFormListItem[]) : []);
      })
      .finally(() => {
        if (!cancelled) setFormsListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [calendarModal]);

  /** On first load, keep window and calendar scroll areas at the top (no auto-scroll to "today" week). */
  useLayoutEffect(() => {
    if (loading) return;
    if (calendarInitialScrollResetDoneRef.current) return;
    calendarInitialScrollResetDoneRef.current = true;
    window.scrollTo(0, 0);
    if (calendarHScrollRef.current) calendarHScrollRef.current.scrollLeft = 0;
    if (calendarVScrollRef.current) calendarVScrollRef.current.scrollTop = 0;
  }, [loading]);

  /** Live window listeners for grid time-range drag (cleanup on unmount). */
  const gridDragListenersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(
    null
  );

  useEffect(() => {
    return () => {
      const L = gridDragListenersRef.current;
      if (L) {
        window.removeEventListener("pointermove", L.move);
        window.removeEventListener("pointerup", L.up);
        window.removeEventListener("pointercancel", L.up);
        gridDragListenersRef.current = null;
      }
      activeGridDragRef.current = null;
    };
  }, []);

  function goToAppointment(apt: Appointment) {
    router.push(`/appointments/${apt.id}`);
  }

  function openAppointmentQuickView(apt: Appointment) {
    setCalendarModal({ apt, step: "detail" });
  }

  function closeAppointmentQuickView() {
    setCalendarModal(null);
    setPublishedForms([]);
  }

  function openFormsPickerFromCalendar() {
    setCalendarModal((m) => (m ? { ...m, step: "forms" } : null));
  }

  function selectFormForCalendarClient(formId: number) {
    if (!calendarModal) return;
    const pid = calendarModal.apt.patient.id;
    closeAppointmentQuickView();
    router.push(`/patients/${pid}/clinic-forms?formId=${formId}`);
  }

  function handleGridSlotPointerDown(
    e: React.PointerEvent,
    cellDate: string,
    slotIdx: number,
    slotCount: number
  ) {
    if (!canCreate) return;
    if (isCalendarSlotBlocked(cellDate, slotIdx, slotMinutes, scheduleBlocks)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const timeline = (e.currentTarget as HTMLElement).closest("[data-calendar-timeline]");
    if (!timeline || !(timeline instanceof HTMLElement)) return;

    const prev = gridDragListenersRef.current;
    if (prev) {
      window.removeEventListener("pointermove", prev.move);
      window.removeEventListener("pointerup", prev.up);
      window.removeEventListener("pointercancel", prev.up);
    }

    activeGridDragRef.current = {
      timeline,
      date: cellDate,
      anchorIdx: slotIdx,
      slotCount,
      slotMinutes,
    };
    setGridDragRange({ date: cellDate, lo: slotIdx, hi: slotIdx });

    const onMove = (ev: PointerEvent) => {
      const d = activeGridDragRef.current;
      if (!d) return;
      const idx = slotIndexFromClientY(d.timeline, ev.clientY, d.slotCount);
      const lo = Math.min(d.anchorIdx, idx);
      const hi = Math.max(d.anchorIdx, idx);
      setGridDragRange({ date: d.date, lo, hi });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      gridDragListenersRef.current = null;
      const d = activeGridDragRef.current;
      activeGridDragRef.current = null;
      setGridDragRange(null);
      if (!d || !canCreate) return;
      const idx = slotIndexFromClientY(d.timeline, ev.clientY, d.slotCount);
      const lo = Math.min(d.anchorIdx, idx);
      const hi = Math.max(d.anchorIdx, idx);
      if (calendarRangeTouchesBlockedSlot(d.date, lo, hi, d.slotMinutes, scheduleBlocks)) {
        return;
      }
      const { start, end } = calendarDragRangeToBookingTimes(lo, hi, d.slotMinutes);
      router.push(
        `/appointments/new?date=${encodeURIComponent(d.date)}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`
      );
    };

    gridDragListenersRef.current = { move: onMove, up: onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const monthName = new Date(year, month).toLocaleString("default", { month: "long", year: "numeric" });
  const monthInputValue = `${year}-${String(month + 1).padStart(2, "0")}`;
  const todayDateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  /** Calendar grid uses local "today" for column highlight. */
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

  async function persistSlotMinutes(next: AppointmentCalendarSlotMinutes) {
    if (!canManageSlotStep || next === slotMinutes) return;
    setSlotStepError("");
    setSlotStepSaving(true);
    const prev = slotMinutes;
    setSlotMinutes(next);
    try {
      const res = await authFetch("/api/settings/appointment-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotMinutes: next }),
      });
      const data = (await res.json()) as { error?: string; slotMinutes?: number };
      if (!res.ok) {
        setSlotMinutes(prev);
        setSlotStepError(typeof data.error === "string" ? data.error : "Could not save time step");
        return;
      }
      if (typeof data.slotMinutes === "number" && isAppointmentCalendarSlotMinutes(data.slotMinutes)) {
        setSlotMinutes(data.slotMinutes);
      }
    } catch {
      setSlotMinutes(prev);
      setSlotStepError("Could not save time step");
    } finally {
      setSlotStepSaving(false);
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
            {canManageSlotStep ? (
              <div className="flex min-w-0 flex-col items-end gap-0.5">
                <div
                  className="flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-900"
                  role="group"
                  aria-label="Calendar time step in minutes"
                >
                  {APPOINTMENT_CALENDAR_SLOT_MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={slotStepSaving || loading}
                      onClick={() => void persistSlotMinutes(m)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums disabled:opacity-50 ${
                        slotMinutes === m
                          ? "bg-brand-500 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                {slotStepError ? (
                  <span className="max-w-[12rem] text-[10px] text-red-600 sm:text-right dark:text-red-400">
                    {slotStepError}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {slotMinutes} min grid
                <Link
                  href="/settings/appointment-calendar"
                  className="ml-2 font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Calendar settings
                </Link>
              </span>
            )}
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
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]"
              >
                <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ minWidth: weekRowMinWidthForView(viewMode) }}>
                  <div
                    ref={calendarVScrollRef}
                    className="min-h-0 flex-1 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]"
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
                {weeksToRender.map((week, weekIndex) => (
                  <div
                    key={week[0]?.date ?? weekIndex}
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
                        <div className="flex min-h-[220px] min-w-0 flex-col border-b border-gray-200 p-1.5 pt-1 dark:border-gray-700">
                          <div className="flex-1">
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
                      const dayApts = (appointmentsByDate[cell.date] || [])
                        .filter((a) => a.status !== "cancelled")
                        .sort(sortByStartTime);
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
                          className={`flex min-h-[220px] min-w-0 flex-col border-b border-r border-gray-200 p-1.5 pt-1 last:border-r-0 dark:border-gray-700 ${baseBg} ${canCreate ? "dark:hover:bg-brand-500/5" : ""} transition-colors`}
                        >
                          <div className="flex-1">
                            <div className="rounded-lg border border-gray-200/80 bg-white/90 dark:border-gray-700 dark:bg-gray-950/40">
                              <div
                                data-calendar-timeline
                                className="relative touch-none overflow-visible select-none"
                                style={{ minHeight: timelineH }}
                              >
                                {gridDragRange?.date === cell.date && canCreate && (
                                  <div
                                    className="pointer-events-none absolute right-0 left-0 z-[1] bg-brand-500/25 ring-1 ring-brand-500/40 ring-inset dark:bg-brand-500/20"
                                    style={{
                                      top: gridDragRange.lo * SLOT_PX,
                                      height: (gridDragRange.hi - gridDragRange.lo + 1) * SLOT_PX,
                                    }}
                                  />
                                )}
                                {Array.from({ length: slotCount }, (_, slotIdx) => {
                                  const startMin = CAL_DAY_START_MIN + slotIdx * slotMinutes;
                                  const rowLabel = formatMinutesFromMidnightAs24h(startMin);
                                  const rowCenterPx = slotIdx * SLOT_PX + SLOT_PX / 2;
                                  const slotBlocked = isCalendarSlotBlocked(
                                    cell.date,
                                    slotIdx,
                                    slotMinutes,
                                    scheduleBlocks
                                  );
                                  return (
                                    <div
                                      key={startMin}
                                      style={{ top: slotIdx * SLOT_PX, height: SLOT_PX }}
                                      title={
                                        slotBlocked
                                          ? `${rowLabel} — blocked`
                                          : canCreate
                                            ? `${rowLabel} — drag up or down to choose a range, release to add booking`
                                            : rowLabel
                                      }
                                      onPointerDown={
                                        slotBlocked
                                          ? (e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }
                                          : canCreate
                                            ? (e) =>
                                                handleGridSlotPointerDown(e, cell.date, slotIdx, slotCount)
                                            : undefined
                                      }
                                      onMouseEnter={() => {
                                        if (slotBlocked) return;
                                        setHoverSlotByDate((prev) => ({
                                          ...prev,
                                          [cell.date]: { label: rowLabel, topPx: rowCenterPx },
                                        }));
                                      }}
                                      onMouseLeave={() =>
                                        setHoverSlotByDate((prev) => ({ ...prev, [cell.date]: null }))
                                      }
                                      className={`pointer-events-auto absolute right-0 left-0 border-b border-gray-200/80 dark:border-gray-700 ${
                                        slotBlocked
                                          ? "cursor-not-allowed bg-gray-200/50 opacity-60 dark:bg-gray-800/60"
                                          : `bg-gray-50/40 dark:bg-gray-900/30 ${
                                              canCreate
                                                ? "cursor-cell hover:bg-brand-400/25 dark:hover:bg-brand-500/30"
                                                : ""
                                            }`
                                      }`}
                                    />
                                  );
                                })}
                                <div
                                  className="pointer-events-none absolute left-0 right-0 top-0 z-[2]"
                                  style={{ height: timelineH }}
                                >
                                  {scheduleBlocks
                                    .filter((b) => b.isActive !== false && blockAppliesToDate(b, cell.date))
                                    .flatMap((b) => {
                                      const title = `${b.label || "Blocked"}${b.branch ? ` · ${b.branch.name}` : " · All branches"}`;
                                      if (b.allDay) {
                                        return [
                                          <div
                                            key={`block-${b.id}-${cell.date}`}
                                            title={title}
                                            className="absolute inset-x-0 top-0 bg-gray-500/15 dark:bg-gray-400/10"
                                            style={{
                                              height: timelineH,
                                              backgroundImage:
                                                "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(120,120,120,0.14) 6px, rgba(120,120,120,0.14) 7px)",
                                            }}
                                          />,
                                        ];
                                      }
                                      return (b.windows ?? []).map((w) => {
                                        const top = appointmentTopPx(w.startTime, slotMinutes);
                                        const h = blockSegmentHeightPx(w.startTime, w.endTime, slotMinutes);
                                        const maxDown = Math.max(0, timelineH - top);
                                        const minH = Math.min(h, maxDown || h);
                                        return (
                                          <div
                                            key={`block-${b.id}-w-${w.id}-${cell.date}`}
                                            title={title}
                                            className="absolute left-0.5 right-0.5 rounded border border-gray-500/35 bg-gray-500/20 dark:bg-gray-400/15"
                                            style={{ top, minHeight: minH, maxHeight: maxDown }}
                                          />
                                        );
                                      });
                                    })}
                                </div>
                                <div
                                  className="pointer-events-none absolute left-0 right-0 top-0 z-[3]"
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

                                    if (svcColor) {
                                      return (
                                        <button
                                          key={apt.id}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openAppointmentQuickView(apt);
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
                                          openAppointmentQuickView(apt);
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
                ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-4 py-3 text-xs dark:border-gray-800 dark:bg-gray-900/20">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" />
                  Available
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/20" />
                  Booked
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm border border-red-200 bg-red-100 dark:border-red-800 dark:bg-red-950/50" />
                  Cancelled (see list — time is free)
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Today
                </span>
                {canCreate && (
                  <span className="max-w-xl text-gray-500 dark:text-gray-400">
                    Grid runs from 06:00–24:00. Drag across free slots to add a booking. Cancelled visits are not shown on
                    the grid so you can reuse the same time.{" "}
                    <Link
                      href={`/appointments/cancelled?from=${encodeURIComponent(rangeForFetch().startStr)}&to=${encodeURIComponent(rangeForFetch().endStr)}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Open cancelled bookings for this period
                    </Link>
                    .
                  </span>
                )}
              </div>
              <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                <Link
                  href="/appointments/cancelled"
                  className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Full cancelled bookings list (pick any date range)
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      {calendarModal && calendarModal.step === "detail" && canOpenClinicForms ? (
        <button
          type="button"
          onClick={openFormsPickerFromCalendar}
          title="Fill a clinic form for this client"
          className="fixed bottom-6 right-6 z-[100000] flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-2 ring-white/30 transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-500/40 dark:bg-brand-500 dark:hover:bg-brand-400 dark:ring-gray-900/80"
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          <span className="sr-only">Open clinic forms list</span>
        </button>
      ) : null}

      <Modal
        isOpen={calendarModal != null}
        onClose={closeAppointmentQuickView}
        className="max-w-lg max-h-[90vh] overflow-y-auto p-6 sm:max-w-xl sm:p-8"
      >
        {calendarModal ? (
          calendarModal.step === "detail" ? (
            <>
              <h2 className="pr-10 text-lg font-semibold text-gray-900 dark:text-white">Booking</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {formatTime12hLabel(calendarModal.apt.startTime)}
                {calendarModal.apt.endTime ? ` – ${formatTime12hLabel(calendarModal.apt.endTime)}` : ""}
                {" · "}
                {calendarModal.apt.appointmentDate.slice(0, 10)}
              </p>
              <div className="mt-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Client</p>
                  <p className="mt-1">
                    <Link
                      href={`/patients/${calendarModal.apt.patient.id}/history`}
                      className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
                      onClick={closeAppointmentQuickView}
                    >
                      {calendarModal.apt.patient.name}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {calendarModal.apt.patient.patientCode}
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Status</p>
                    <p className="mt-1 capitalize">{calendarModal.apt.status.replace(/-/g, " ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Branch</p>
                    <p className="mt-1">{calendarModal.apt.branch.name}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Doctor</p>
                    <p className="mt-1">
                      Dr. {calendarModal.apt.doctor.name}
                      {calendarModal.apt.doctor.specialty
                        ? ` · ${calendarModal.apt.doctor.specialty}`
                        : ""}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Services</p>
                    <p className="mt-1">{formatServicesForCalendar(calendarModal.apt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Duration</p>
                    <p className="mt-1">
                      {formatMinutesAsLabel(
                        appointmentDurationMinutes(calendarModal.apt.startTime, calendarModal.apt.endTime)
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => goToAppointment(calendarModal.apt)}
                >
                  Open full booking
                </Button>
                {canOpenClinicForms ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={openFormsPickerFromCalendar}
                    startIcon={<Plus className="h-4 w-4" />}
                  >
                    Clinic form
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <h2 className="pr-10 text-lg font-semibold text-gray-900 dark:text-white">Choose a form</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                For {calendarModal.apt.patient.name}. After you submit, you will be taken to client history.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                size="sm"
                type="button"
                onClick={() => setCalendarModal((m) => (m ? { ...m, step: "detail" } : null))}
              >
                ← Back to booking
              </Button>
              <div className="mt-4 max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
                {formsListLoading ? (
                  <p className="p-4 text-sm text-gray-500">Loading forms…</p>
                ) : publishedForms.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No published forms.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {publishedForms.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/80"
                          onClick={() => selectFormForCalendarClient(f.id)}
                        >
                          <span className="font-medium text-gray-900 dark:text-white">{f.title}</span>
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                            {f._count.fields} field{f._count.fields === 1 ? "" : "s"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )
        ) : null}
      </Modal>
    </div>
  );
}
