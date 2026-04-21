/**
 * Parse "HH:mm" or "H:mm" to minutes from midnight.
 */
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

/** Default slot length when end time is missing (minutes). */
export const DEFAULT_APPOINTMENT_DURATION_MIN = 30;

/** Calendar grid & booking time-step options (Settings → Appointment calendar). */
export const APPOINTMENT_CALENDAR_SLOT_MINUTES = [15, 30] as const;
export type AppointmentCalendarSlotMinutes = (typeof APPOINTMENT_CALENDAR_SLOT_MINUTES)[number];

export function isAppointmentCalendarSlotMinutes(n: number): n is AppointmentCalendarSlotMinutes {
  return n === 15 || n === 30;
}

/** Full-day "HH:mm" list in steps of `slotMinutes` (00:00 … last slot before midnight). */
export function buildDayTimeSlots(slotMinutes: AppointmentCalendarSlotMinutes): string[] {
  const n = Math.floor((24 * 60) / slotMinutes);
  return Array.from({ length: n }, (_, i) => {
    const totalMin = i * slotMinutes;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
}

/** Minutes from midnight for the end of the slot row that starts at `startMin` (same day). */
export function slotRowEndMinutes(startMin: number, slotMinutes: number): number {
  return startMin + slotMinutes;
}

/** "HH:mm" label for the end instant of a slot row (handles 24:00). */
export function formatSlotEndTimeLabel(startMin: number, slotMinutes: number): string {
  const end = slotRowEndMinutes(startMin, slotMinutes);
  if (end >= 24 * 60) return "24:00";
  const h = Math.floor(end / 60);
  const m = end % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 12-hour label for a minute-of-day (0–1439), e.g. for the time gutter. */
export function formatMinutesFromMidnightAs12h(totalMin: number): string {
  const clamped = Math.max(0, Math.min(totalMin, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return formatTime12hLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

/** End of slot row in 12-hour form (for hover chip). Midnight end → "12:00 AM". */
export function formatSlotEndTime12hLabel(startMin: number, slotMinutes: number): string {
  const end = slotRowEndMinutes(startMin, slotMinutes);
  if (end >= 24 * 60) {
    return formatTime12hLabel("00:00");
  }
  const h = Math.floor(end / 60);
  const mm = end % 60;
  return formatTime12hLabel(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
}

/** e.g. "07:00 AM" for calendar cards (locale-aware 12h). */
export function formatTime12hLabel(hhmm: string): string {
  const m = parseTimeToMinutes(hhmm);
  if (m == null) return hhmm;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const d = new Date(2000, 0, 1, h24, min, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Pick the nearest slot time if `hhmm` is not in the list (e.g. after switching 15↔30 min). */
export function snapTimeToSlotList(hhmm: string, slots: string[]): string {
  if (slots.length === 0) return hhmm;
  if (slots.includes(hhmm)) return hhmm;
  const m = parseTimeToMinutes(hhmm);
  if (m == null) return slots[0]!;
  let best = slots[0]!;
  let bestD = Infinity;
  for (const s of slots) {
    const sm = parseTimeToMinutes(s);
    if (sm == null) continue;
    const d = Math.abs(sm - m);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function appointmentDurationMinutes(startTime: string, endTime: string | null | undefined): number {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return DEFAULT_APPOINTMENT_DURATION_MIN;
  const end = parseTimeToMinutes(endTime ?? "");
  if (end == null) return DEFAULT_APPOINTMENT_DURATION_MIN;
  const d = end - start;
  if (d <= 0) return DEFAULT_APPOINTMENT_DURATION_MIN;
  if (d < 15) return 15;
  return d;
}

/**
 * How many calendar rows (each row = `slotMinutes`) a duration spans — e.g. 30 min → 2 rows at 15 min slots; 60 min → 4 rows.
 */
export function durationSlotRowCount(durationMinutes: number, slotMinutes: number): number {
  return Math.max(1, Math.ceil(durationMinutes / slotMinutes));
}

export function formatMinutesAsLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Human label for stored reminder (minutes before start). */
export function formatReminderLabel(minutesBefore: number | null | undefined): string {
  if (minutesBefore == null || minutesBefore <= 0) return "No reminder";
  if (minutesBefore < 60) return `${minutesBefore} min before`;
  if (minutesBefore % 1440 === 0) {
    const d = minutesBefore / 1440;
    return d === 1 ? "1 day before" : `${d} days before`;
  }
  if (minutesBefore % 60 === 0) {
    const h = minutesBefore / 60;
    return h === 1 ? "1 hour before" : `${h} hours before`;
  }
  return `${formatMinutesAsLabel(minutesBefore)} before`;
}

/** Add minutes to a same-day "HH:mm" time; returns null if outside 00:00–23:59. */
export function addMinutesToHHmm(time: string, deltaMin: number): string | null {
  const m = parseTimeToMinutes(time);
  if (m == null) return null;
  const n = m + deltaMin;
  if (n < 0 || n > 23 * 60 + 59) return null;
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** ISO date string YYYY-MM-DD plus calendar days. */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
