import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appointmentDurationMinutes, parseTimeToMinutes } from "@/lib/appointment-calendar-time";
import type { AnalyticsReport } from "@/lib/analytics/types";
import {
  buildTimeBuckets,
  dateOnlyKey,
  percentChange,
  round2,
  safeDivide,
  seriesFromBuckets,
  topN,
  type AnalyticsScope,
} from "@/lib/analytics/scope";

const STATUS_ORDER = ["scheduled", "pending", "completed", "cancelled", "no-show", "draft"];
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATION_BANDS: { label: string; max: number }[] = [
  { label: "Up to 15 min", max: 15 },
  { label: "16–30 min", max: 30 },
  { label: "31–60 min", max: 60 },
  { label: "61–120 min", max: 120 },
  { label: "Over 2 hours", max: Number.POSITIVE_INFINITY },
];

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, " ");
}

export async function buildAppointmentsReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const buckets = buildTimeBuckets(scope);

  const where: Prisma.AppointmentWhereInput = {
    appointmentDate: scope.dateOnlyFilter,
    ...scope.branchWhere,
  };
  const previousWhere: Prisma.AppointmentWhereInput = {
    ...where,
    appointmentDate: scope.previous.dateOnlyFilter,
  };

  const [appointments, previousCount, serviceLines] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: {
        id: true,
        appointmentDate: true,
        startTime: true,
        endTime: true,
        status: true,
        patientId: true,
      },
    }),
    prisma.appointment.count({ where: previousWhere }),
    prisma.appointmentService.findMany({
      where: { appointment: { ...where, status: { not: "cancelled" } } },
      select: {
        appointmentId: true,
        quantity: true,
        totalAmount: true,
        service: { select: { id: true, name: true } },
      },
    }),
  ]);

  const total = appointments.length;
  const statusTotals = new Map<string, number>();
  const weekdayTotals = new Array(7).fill(0) as number[];
  const hourTotals = new Array(24).fill(0) as number[];
  const durationBandTotals = new Array(DURATION_BANDS.length).fill(0) as number[];
  const uniqueClients = new Set<number>();
  let durationSum = 0;

  for (const appointment of appointments) {
    statusTotals.set(appointment.status, (statusTotals.get(appointment.status) ?? 0) + 1);
    uniqueClients.add(appointment.patientId);

    // appointmentDate is a date-only column, so read the weekday in UTC to avoid an off-by-one day.
    weekdayTotals[appointment.appointmentDate.getUTCDay()] += 1;

    const startMinutes = parseTimeToMinutes(appointment.startTime);
    if (startMinutes != null) {
      const hour = Math.min(23, Math.max(0, Math.floor(startMinutes / 60)));
      hourTotals[hour] += 1;
    }

    const duration = appointmentDurationMinutes(appointment.startTime, appointment.endTime);
    durationSum += duration;
    const bandIndex = DURATION_BANDS.findIndex((band) => duration <= band.max);
    durationBandTotals[bandIndex >= 0 ? bandIndex : DURATION_BANDS.length - 1] += 1;
  }

  const statusRows = [...statusTotals.entries()].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a[0]);
    const bi = STATUS_ORDER.indexOf(b[0]);
    return (ai < 0 ? STATUS_ORDER.length : ai) - (bi < 0 ? STATUS_ORDER.length : bi);
  });

  const completed = statusTotals.get("completed") ?? 0;
  const cancelled = statusTotals.get("cancelled") ?? 0;
  const noShow = statusTotals.get("no-show") ?? 0;

  const statusSeries = statusRows.map(([status]) => ({
    name: statusLabel(status),
    data: seriesFromBuckets(
      buckets,
      appointments
        .filter((a) => a.status === status)
        .map((a) => ({ dayKey: dateOnlyKey(a.appointmentDate), value: 1 }))
    ),
  }));

  const totalSeries = seriesFromBuckets(
    buckets,
    appointments.map((a) => ({ dayKey: dateOnlyKey(a.appointmentDate), value: 1 }))
  );

  const serviceTotals = new Map<
    number,
    { name: string; bookings: Set<number>; quantity: number; revenue: number }
  >();
  for (const line of serviceLines) {
    const existing =
      serviceTotals.get(line.service.id) ??
      { name: line.service.name, bookings: new Set<number>(), quantity: 0, revenue: 0 };
    existing.bookings.add(line.appointmentId);
    existing.quantity += line.quantity;
    existing.revenue += line.totalAmount;
    serviceTotals.set(line.service.id, existing);
  }
  const serviceRows = [...serviceTotals.values()].map((row) => ({
    name: row.name,
    bookings: row.bookings.size,
    quantity: row.quantity,
    revenue: round2(row.revenue),
  }));
  const topServices = topN(serviceRows, 12, (row) => row.bookings);

  const busiestHourIndex = hourTotals.indexOf(Math.max(...hourTotals));
  const busiestWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));

  return {
    section: "appointments",
    title: "Appointment analytics",
    description:
      "Booking volume, status outcomes, no-show and cancellation rates, busiest weekdays and hours, and top services.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "Every booking in the range is counted, including cancelled ones, so outcome rates are meaningful. Service breakdowns exclude cancelled bookings.",
      "Duration comes from the booked start and end time; bookings without an end time fall back to the default 30-minute slot.",
    ],
    kpis: [
      {
        key: "total",
        label: "Total bookings",
        value: total,
        format: "number",
        hint: "All statuses",
        changePercent: percentChange(total, previousCount),
      },
      { key: "completed", label: "Completed", value: completed, format: "number", hint: "Visits marked done" },
      {
        key: "completionRate",
        label: "Completion rate",
        value: round2(safeDivide(completed, total) * 100),
        format: "percent",
        hint: "Completed of all bookings",
      },
      {
        key: "cancellationRate",
        label: "Cancellation rate",
        value: round2(safeDivide(cancelled, total) * 100),
        format: "percent",
        hint: `${cancelled} cancelled`,
      },
      {
        key: "noShowRate",
        label: "No-show rate",
        value: round2(safeDivide(noShow, total) * 100),
        format: "percent",
        hint: `${noShow} no-shows`,
      },
      {
        key: "uniqueClients",
        label: "Clients seen",
        value: uniqueClients.size,
        format: "number",
        hint: "Distinct clients booked",
      },
      {
        key: "avgPerDay",
        label: "Bookings per day",
        value: round2(safeDivide(total, scope.dayCount)),
        format: "number",
        hint: `Across ${scope.dayCount} day${scope.dayCount === 1 ? "" : "s"}`,
      },
      {
        key: "avgDuration",
        label: "Average duration",
        value: Math.round(safeDivide(durationSum, total)),
        format: "number",
        hint: "Minutes per booking",
      },
    ],
    charts: [
      {
        key: "bookingsOverTime",
        title: "Bookings over time by outcome",
        subtitle: buckets.granularity === "month" ? "Grouped by month" : "Grouped by day",
        type: "bar",
        categories: buckets.labels,
        series: statusSeries.length > 0 ? statusSeries : [{ name: "Bookings", data: totalSeries }],
        format: "number",
        span: 12,
        stacked: true,
      },
      {
        key: "statusMix",
        title: "Outcome mix",
        type: "donut",
        categories: statusRows.map(([status]) => statusLabel(status)),
        series: [{ name: "Bookings", data: statusRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "byWeekday",
        title: "Busiest weekdays",
        type: "bar",
        categories: WEEKDAY_LABELS.map((d) => d.slice(0, 3)),
        series: [{ name: "Bookings", data: weekdayTotals }],
        format: "number",
        span: 6,
      },
      {
        key: "byHour",
        title: "Bookings by start hour",
        subtitle: "Peak demand across the working day",
        type: "bar",
        categories: hourTotals.map((_, hour) => `${String(hour).padStart(2, "0")}:00`),
        series: [{ name: "Bookings", data: hourTotals }],
        format: "number",
        span: 12,
      },
      {
        key: "topServices",
        title: "Top services by bookings",
        type: "hbar",
        categories: topServices.map((row) => row.name),
        series: [{ name: "Bookings", data: topServices.map((row) => row.bookings) }],
        format: "number",
        span: 6,
      },
      {
        key: "durationMix",
        title: "Visit length mix",
        type: "donut",
        categories: DURATION_BANDS.map((band) => band.label),
        series: [{ name: "Bookings", data: durationBandTotals }],
        format: "number",
        span: 6,
      },
    ],
    tables: [
      {
        key: "bookingsByPeriod",
        title: `Bookings by ${buckets.granularity}`,
        columns: [
          { key: "period", label: buckets.granularity === "month" ? "Month" : "Date" },
          { key: "bookings", label: "Bookings", align: "right", format: "number" },
        ],
        rows: buckets.labels.map((label, i) => ({ period: label, bookings: totalSeries[i] ?? 0 })),
        totals: { period: "Total", bookings: total },
      },
      {
        key: "statusTable",
        title: "Outcome breakdown",
        columns: [
          { key: "status", label: "Status" },
          { key: "bookings", label: "Bookings", align: "right", format: "number" },
          { key: "share", label: "Share", align: "right", format: "percent" },
        ],
        rows: statusRows.map(([status, count]) => ({
          status: statusLabel(status),
          bookings: count,
          share: round2(safeDivide(count, total) * 100),
        })),
        totals: { status: "Total", bookings: total, share: total > 0 ? 100 : 0 },
      },
      {
        key: "serviceTable",
        title: "Services booked",
        subtitle: "Cancelled bookings excluded",
        columns: [
          { key: "service", label: "Service" },
          { key: "bookings", label: "Bookings", align: "right", format: "number" },
          { key: "quantity", label: "Units", align: "right", format: "number" },
          { key: "revenue", label: "Charged", align: "right", format: "currency" },
        ],
        rows: topN(serviceRows, 25, (row) => row.bookings).map((row) => ({
          service: row.name,
          bookings: row.bookings,
          quantity: row.quantity,
          revenue: row.revenue,
        })),
      },
      {
        key: "peakTable",
        title: "Peak demand",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value" },
        ],
        rows: [
          {
            metric: "Busiest weekday",
            value: total > 0 ? `${WEEKDAY_LABELS[busiestWeekdayIndex]} (${weekdayTotals[busiestWeekdayIndex]})` : "—",
          },
          {
            metric: "Busiest start hour",
            value:
              total > 0
                ? `${String(busiestHourIndex).padStart(2, "0")}:00 (${hourTotals[busiestHourIndex]})`
                : "—",
          },
          { metric: "Distinct clients", value: uniqueClients.size },
          {
            metric: "Average services per booking",
            value: round2(safeDivide(serviceLines.length, total || 1)),
          },
        ],
      },
    ],
  };
}
