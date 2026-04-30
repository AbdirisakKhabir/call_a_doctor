import { parseTimeToMinutes } from "@/lib/appointment-calendar-time";

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** Normalize UI / API time to HH:mm (24h). */
export function normalizeToHHmm(raw: string): string | null {
  const t = raw.trim();
  const m2 = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(t);
  if (m2) return normalizeToHHmm(`${m2[1]}:${m2[2]}`);
  const m = HHMM.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type BlockWindowPayload = { startTime: string; endTime: string };

export function parseWindowsFromRequest(
  body: Record<string, unknown>,
  allDay: boolean
): { ok: true; windows: BlockWindowPayload[] } | { ok: false; error: string } {
  if (allDay) return { ok: true, windows: [] };

  let rows: unknown[] | null = null;
  if (Array.isArray(body.windows)) {
    rows = body.windows as unknown[];
  } else if (
    typeof body.startTime === "string" &&
    typeof body.endTime === "string" &&
    body.startTime.trim() &&
    body.endTime.trim()
  ) {
    rows = [{ startTime: body.startTime, endTime: body.endTime }];
  }

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Add at least one time window (from / to)." };
  }

  const windows: BlockWindowPayload[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    const st = normalizeToHHmm(String(row.startTime ?? ""));
    const en = normalizeToHHmm(String(row.endTime ?? ""));
    if (!st || !en) {
      return { ok: false, error: `Window ${i + 1}: use valid times (HH:mm).` };
    }
    const a = parseTimeToMinutes(st);
    const b = parseTimeToMinutes(en);
    if (a == null || b == null || b <= a) {
      return { ok: false, error: `Window ${i + 1}: end time must be after start time.` };
    }
    windows.push({ startTime: st, endTime: en });
  }
  return { ok: true, windows };
}
