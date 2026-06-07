import { parseTimeToMinutes, DEFAULT_APPOINTMENT_DURATION_MIN } from "@/lib/appointment-calendar-time";

/** Block row as returned by GET /api/settings/appointment-blocks (client-safe subset). */
export type ClientScheduleBlock = {
  allDay: boolean;
  startDate: string;
  endDate: string;
  branchId: number | null;
  isActive: boolean;
  windows: { startTime: string; endTime: string }[];
};

export function blockAppliesToBookingDay(
  b: ClientScheduleBlock,
  isoDate: string,
  branchId: number
): boolean {
  if (!b.isActive) return false;
  const d = isoDate.slice(0, 10);
  const s = b.startDate.slice(0, 10);
  const e = b.endDate.slice(0, 10);
  if (d < s || d > e) return false;
  if (b.branchId != null && b.branchId !== branchId) return false;
  return true;
}

/** Half-open overlap: appointment [aptStart, aptEnd) vs block [b1, b2). */
export function intervalOverlapsBlockedWindows(
  aptStartM: number,
  aptEndM: number,
  blocks: ClientScheduleBlock[],
  isoDate: string,
  branchId: number
): boolean {
  for (const b of blocks) {
    if (!blockAppliesToBookingDay(b, isoDate, branchId)) continue;
    if (b.allDay) return true;
    for (const w of b.windows) {
      const b1 = parseTimeToMinutes(w.startTime);
      const b2 = parseTimeToMinutes(w.endTime);
      if (b1 == null || b2 == null || b2 <= b1) continue;
      if (aptStartM < b2 && aptEndM > b1) return true;
    }
  }
  return false;
}

/** Starting at `startHHmm` with default visit length would overlap a block (matches server guard). */
export function isStartSlotBlockedForNewBooking(
  startHHmm: string,
  blocks: ClientScheduleBlock[],
  isoDate: string,
  branchId: number,
  assumedDurationMin = DEFAULT_APPOINTMENT_DURATION_MIN
): boolean {
  const sm = parseTimeToMinutes(startHHmm);
  if (sm == null) return false;
  const em = sm + assumedDurationMin;
  return intervalOverlapsBlockedWindows(sm, em, blocks, isoDate, branchId);
}

export function isIntervalBlocked(
  startHHmm: string,
  endHHmm: string,
  blocks: ClientScheduleBlock[],
  isoDate: string,
  branchId: number
): boolean {
  const sm = parseTimeToMinutes(startHHmm);
  const em = parseTimeToMinutes(endHHmm);
  if (sm == null || em == null || em <= sm) return true;
  return intervalOverlapsBlockedWindows(sm, em, blocks, isoDate, branchId);
}

function padHhmm(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Parse API JSON block into client shape (ignores extra fields). */
export function normalizeClientScheduleBlock(raw: unknown): ClientScheduleBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const windowsRaw = r.windows;
  const windows = Array.isArray(windowsRaw)
    ? windowsRaw
        .map((w) => {
          if (!w || typeof w !== "object") return null;
          const x = w as Record<string, unknown>;
          const st = padHhmm(String(x.startTime ?? ""));
          const en = padHhmm(String(x.endTime ?? ""));
          if (!st || !en) return null;
          return { startTime: st, endTime: en };
        })
        .filter(Boolean) as { startTime: string; endTime: string }[]
    : [];
  const branchIdRaw = r.branchId;
  return {
    allDay: r.allDay === true,
    startDate: String(r.startDate ?? "").slice(0, 10),
    endDate: String(r.endDate ?? "").slice(0, 10),
    branchId:
      branchIdRaw === null || branchIdRaw === undefined || branchIdRaw === ""
        ? null
        : Number(branchIdRaw),
    isActive: r.isActive !== false,
    windows,
  };
}
