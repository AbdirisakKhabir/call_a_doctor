import type { PrismaClient } from "@prisma/client";
import { parseTimeToMinutes, DEFAULT_APPOINTMENT_DURATION_MIN } from "@/lib/appointment-calendar-time";

type Db = Pick<PrismaClient, "appointmentScheduleBlock">;

function parseDay(isoYmd: string): Date {
  return new Date(isoYmd + "T12:00:00");
}

function blockTitle(b: { label: string | null; allDay: boolean }): string {
  const t = b.label?.trim();
  if (t) return t;
  return b.allDay ? "Holiday / closed day" : "Blocked hours";
}

/**
 * Returns a user-facing error when the appointment overlaps an active schedule block.
 */
export async function getAppointmentBlockMessage(
  db: Db,
  params: {
    branchId: number;
    appointmentDate: string;
    startTime: string;
    endTime: string | null;
  }
): Promise<string | null> {
  const day = params.appointmentDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const dayDate = parseDay(day);

  const blocks = await db.appointmentScheduleBlock.findMany({
    where: {
      isActive: true,
      startDate: { lte: dayDate },
      endDate: { gte: dayDate },
      OR: [{ branchId: null }, { branchId: params.branchId }],
    },
    include: { windows: { orderBy: { sortOrder: "asc" } } },
  });

  const aptStartM = parseTimeToMinutes(params.startTime);
  if (aptStartM == null) return null;
  const aptEndRaw = parseTimeToMinutes(params.endTime ?? "");
  const aptEndM =
    aptEndRaw != null && aptEndRaw > aptStartM ? aptEndRaw : aptStartM + DEFAULT_APPOINTMENT_DURATION_MIN;

  for (const b of blocks) {
    if (b.allDay) {
      return `Bookings are not allowed on this date (${blockTitle(b)}).`;
    }
    for (const w of b.windows) {
      const b1 = parseTimeToMinutes(w.startTime);
      const b2 = parseTimeToMinutes(w.endTime);
      if (b1 == null || b2 == null || b2 <= b1) continue;
      if (aptStartM < b2 && aptEndM > b1) {
        return `This time overlaps blocked hours (${blockTitle(b)}). Choose a different slot.`;
      }
    }
  }

  return null;
}
