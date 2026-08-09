import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsReport } from "@/lib/analytics/types";
import { percentChange, round2, safeDivide, topN, type AnalyticsScope } from "@/lib/analytics/scope";

/** Bars stay readable up to about this many doctors. */
const CHART_DOCTOR_LIMIT = 12;

type DoctorRow = {
  id: number;
  name: string;
  specialty: string | null;
  bookings: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  clients: Set<number>;
  visitCards: number;
  visitFees: number;
  labOrders: number;
  prescriptions: number;
};

function emptyRow(id: number, name: string, specialty: string | null): DoctorRow {
  return {
    id,
    name,
    specialty,
    bookings: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    revenue: 0,
    clients: new Set<number>(),
    visitCards: 0,
    visitFees: 0,
    labOrders: 0,
    prescriptions: 0,
  };
}

export async function buildDoctorsReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const hasBranchScope = Object.keys(scope.branchWhere).length > 0;

  const appointmentWhere: Prisma.AppointmentWhereInput = {
    appointmentDate: scope.dateOnlyFilter,
    ...scope.branchWhere,
  };
  const previousAppointmentWhere: Prisma.AppointmentWhereInput = {
    ...appointmentWhere,
    appointmentDate: scope.previous.dateOnlyFilter,
  };
  const clinicalWhere = hasBranchScope ? { appointment: scope.branchWhere } : {};

  const [appointments, previousCount, visitCards, labOrderGroups, prescriptionGroups] = await Promise.all([
    prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        status: true,
        totalAmount: true,
        patientId: true,
        doctor: { select: { id: true, name: true, specialty: true } },
      },
    }),
    prisma.appointment.count({ where: previousAppointmentWhere }),
    prisma.doctorVisitCard.findMany({
      where: { visitDate: scope.dateOnlyFilter, status: { not: "cancelled" }, ...scope.branchWhere },
      select: { visitFee: true, doctor: { select: { id: true, name: true, specialty: true } } },
    }),
    prisma.labOrder.groupBy({
      by: ["doctorId"],
      where: { createdAt: scope.timestampFilter, status: { not: "cancelled" }, ...clinicalWhere },
      _count: { id: true },
    }),
    prisma.prescription.groupBy({
      by: ["doctorId"],
      where: { createdAt: scope.timestampFilter, status: { not: "cancelled" }, ...clinicalWhere },
      _count: { id: true },
    }),
  ]);

  const rows = new Map<number, DoctorRow>();
  const rowFor = (doctor: { id: number; name: string; specialty: string | null }): DoctorRow => {
    let row = rows.get(doctor.id);
    if (!row) {
      row = emptyRow(doctor.id, doctor.name, doctor.specialty);
      rows.set(doctor.id, row);
    }
    return row;
  };

  for (const appointment of appointments) {
    const row = rowFor(appointment.doctor);
    row.bookings += 1;
    row.clients.add(appointment.patientId);
    if (appointment.status === "completed") row.completed += 1;
    if (appointment.status === "cancelled") row.cancelled += 1;
    if (appointment.status === "no-show") row.noShow += 1;
    if (appointment.status !== "cancelled") row.revenue += appointment.totalAmount;
  }

  for (const card of visitCards) {
    const row = rowFor(card.doctor);
    row.visitCards += 1;
    row.visitFees += card.visitFee;
  }

  // Clinical counts are keyed by doctor id only; doctors with no bookings still deserve a row.
  const unnamedDoctorIds = [...labOrderGroups, ...prescriptionGroups]
    .map((group) => group.doctorId)
    .filter((id) => !rows.has(id));
  if (unnamedDoctorIds.length > 0) {
    const extraDoctors = await prisma.doctor.findMany({
      where: { id: { in: [...new Set(unnamedDoctorIds)] } },
      select: { id: true, name: true, specialty: true },
    });
    for (const doctor of extraDoctors) rowFor(doctor);
  }

  for (const group of labOrderGroups) {
    const row = rows.get(group.doctorId);
    if (row) row.labOrders += group._count.id;
  }
  for (const group of prescriptionGroups) {
    const row = rows.get(group.doctorId);
    if (row) row.prescriptions += group._count.id;
  }

  const allRows = [...rows.values()].map((row) => ({ ...row, revenue: round2(row.revenue), visitFees: round2(row.visitFees) }));
  const ranked = [...allRows].sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
  const chartRows = topN(allRows, CHART_DOCTOR_LIMIT, (row) => row.bookings);
  const revenueChartRows = topN(allRows, CHART_DOCTOR_LIMIT, (row) => row.revenue);

  const totalBookings = appointments.length;
  const totalRevenue = round2(allRows.reduce((sum, row) => sum + row.revenue, 0));
  const totalCompleted = allRows.reduce((sum, row) => sum + row.completed, 0);
  const totalNoShow = allRows.reduce((sum, row) => sum + row.noShow, 0);
  const totalVisitFees = round2(allRows.reduce((sum, row) => sum + row.visitFees, 0));
  const activeDoctors = allRows.filter((row) => row.bookings > 0).length;
  const topDoctor = ranked[0];

  return {
    section: "doctors",
    title: "Doctor performance analytics",
    description:
      "Bookings and revenue per doctor, completion and no-show rates, clients seen, and clinical ordering activity.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "Revenue is the booked charge on each non-cancelled appointment assigned to the doctor.",
      "Consultation fees come from visit cards and are reported separately from booking revenue.",
      "Lab orders and prescriptions count clinical activity raised in the range, whether or not the doctor also had bookings.",
    ],
    kpis: [
      {
        key: "activeDoctors",
        label: "Doctors with bookings",
        value: activeDoctors,
        format: "number",
        hint: `${allRows.length} doctors active overall`,
      },
      {
        key: "bookings",
        label: "Total bookings",
        value: totalBookings,
        format: "number",
        hint: "All statuses",
        changePercent: percentChange(totalBookings, previousCount),
      },
      { key: "revenue", label: "Booking revenue", value: totalRevenue, format: "currency", hint: "Cancelled excluded" },
      {
        key: "revenuePerDoctor",
        label: "Revenue per doctor",
        value: round2(safeDivide(totalRevenue, activeDoctors)),
        format: "currency",
        hint: "Average across active doctors",
      },
      {
        key: "bookingsPerDoctor",
        label: "Bookings per doctor",
        value: round2(safeDivide(totalBookings, activeDoctors)),
        format: "number",
        hint: "Average across active doctors",
      },
      {
        key: "completionRate",
        label: "Completion rate",
        value: round2(safeDivide(totalCompleted, totalBookings) * 100),
        format: "percent",
        hint: `${totalNoShow} no-shows`,
      },
      { key: "visitFees", label: "Consultation fees", value: totalVisitFees, format: "currency", hint: "From visit cards" },
      {
        key: "topDoctor",
        label: "Top earner",
        value: topDoctor ? topDoctor.revenue : 0,
        format: "currency",
        hint: topDoctor ? topDoctor.name : "No activity in range",
      },
    ],
    charts: [
      {
        key: "bookingsByDoctor",
        title: "Bookings by doctor",
        type: "hbar",
        categories: chartRows.map((row) => row.name),
        series: [{ name: "Bookings", data: chartRows.map((row) => row.bookings) }],
        format: "number",
        span: 6,
      },
      {
        key: "revenueByDoctor",
        title: "Revenue by doctor",
        type: "hbar",
        categories: revenueChartRows.map((row) => row.name),
        series: [{ name: "Revenue", data: revenueChartRows.map((row) => row.revenue) }],
        format: "currency",
        span: 6,
      },
      {
        key: "outcomesByDoctor",
        title: "Outcomes by doctor",
        subtitle: "Completed, cancelled, and no-show bookings",
        type: "bar",
        categories: chartRows.map((row) => row.name),
        series: [
          { name: "Completed", data: chartRows.map((row) => row.completed) },
          { name: "Cancelled", data: chartRows.map((row) => row.cancelled) },
          { name: "No-show", data: chartRows.map((row) => row.noShow) },
        ],
        format: "number",
        span: 12,
        stacked: true,
      },
      {
        key: "clientsByDoctor",
        title: "Distinct clients seen",
        type: "hbar",
        categories: chartRows.map((row) => row.name),
        series: [{ name: "Clients", data: chartRows.map((row) => row.clients.size) }],
        format: "number",
        span: 6,
      },
      {
        key: "revenueShare",
        title: "Revenue share",
        type: "donut",
        categories: revenueChartRows.map((row) => row.name),
        series: [{ name: "Revenue", data: revenueChartRows.map((row) => row.revenue) }],
        format: "currency",
        span: 6,
      },
      {
        key: "clinicalActivity",
        title: "Clinical ordering activity",
        subtitle: "Lab orders and prescriptions raised in the range",
        type: "bar",
        categories: chartRows.map((row) => row.name),
        series: [
          { name: "Lab orders", data: chartRows.map((row) => row.labOrders) },
          { name: "Prescriptions", data: chartRows.map((row) => row.prescriptions) },
        ],
        format: "number",
        span: 12,
      },
    ],
    tables: [
      {
        key: "leaderboard",
        title: "Doctor leaderboard",
        subtitle: "Ranked by booking revenue",
        columns: [
          { key: "doctor", label: "Doctor" },
          { key: "specialty", label: "Specialty" },
          { key: "bookings", label: "Bookings", align: "right", format: "number" },
          { key: "completed", label: "Completed", align: "right", format: "number" },
          { key: "noShow", label: "No-show", align: "right", format: "number" },
          { key: "clients", label: "Clients", align: "right", format: "number" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        ],
        rows: ranked.map((row) => ({
          doctor: row.name,
          specialty: row.specialty ?? "—",
          bookings: row.bookings,
          completed: row.completed,
          noShow: row.noShow,
          clients: row.clients.size,
          revenue: row.revenue,
        })),
        totals: {
          doctor: "Total",
          specialty: "",
          bookings: totalBookings,
          completed: totalCompleted,
          noShow: totalNoShow,
          clients: "",
          revenue: totalRevenue,
        },
      },
      {
        key: "clinicalTable",
        title: "Clinical activity",
        columns: [
          { key: "doctor", label: "Doctor" },
          { key: "labOrders", label: "Lab orders", align: "right", format: "number" },
          { key: "prescriptions", label: "Prescriptions", align: "right", format: "number" },
          { key: "visitCards", label: "Visit cards", align: "right", format: "number" },
          { key: "visitFees", label: "Consultation fees", align: "right", format: "currency" },
        ],
        rows: topN(allRows, 25, (row) => row.labOrders + row.prescriptions + row.visitCards).map((row) => ({
          doctor: row.name,
          labOrders: row.labOrders,
          prescriptions: row.prescriptions,
          visitCards: row.visitCards,
          visitFees: row.visitFees,
        })),
      },
    ],
  };
}
