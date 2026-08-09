import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsReport } from "@/lib/analytics/types";
import {
  buildTimeBuckets,
  percentChange,
  round2,
  safeDivide,
  seriesFromBuckets,
  timestampKey,
  topN,
  type AnalyticsScope,
} from "@/lib/analytics/scope";

const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0–12", min: 0, max: 12 },
  { label: "13–17", min: 13, max: 17 },
  { label: "18–30", min: 18, max: 30 },
  { label: "31–45", min: 31, max: 45 },
  { label: "46–60", min: 46, max: 60 },
  { label: "60+", min: 61, max: 200 },
];

const VISIT_FREQUENCY_BANDS = ["1 visit", "2–3 visits", "4–6 visits", "7+ visits"];

function ageOf(patient: { age: number | null; dateOfBirth: Date | null }): number | null {
  if (patient.age != null && Number.isFinite(patient.age)) return patient.age;
  if (!patient.dateOfBirth) return null;
  const diff = Date.now() - patient.dateOfBirth.getTime();
  const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 && years < 200 ? years : null;
}

function normaliseGender(value: string | null): string {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return "Not recorded";
  if (trimmed.startsWith("m")) return "Male";
  if (trimmed.startsWith("f")) return "Female";
  return value!.trim();
}

function visitFrequencyBand(visits: number): number {
  if (visits <= 1) return 0;
  if (visits <= 3) return 1;
  if (visits <= 6) return 2;
  return 3;
}

export async function buildClientsReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const buckets = buildTimeBuckets(scope);

  const registeredBranchWhere: Prisma.PatientWhereInput =
    scope.branchId != null
      ? { registeredBranchId: scope.branchId }
      : scope.allowedBranchIds && scope.allowedBranchIds.length > 0
        ? { registeredBranchId: { in: scope.allowedBranchIds } }
        : {};

  const newClientWhere: Prisma.PatientWhereInput = {
    createdAt: scope.timestampFilter,
    ...registeredBranchWhere,
  };

  const appointmentWhere: Prisma.AppointmentWhereInput = {
    status: { not: "cancelled" },
    appointmentDate: scope.dateOnlyFilter,
    ...scope.branchWhere,
  };

  const [newClients, previousNewCount, cumulativeCount, visitGroups, balanceRows] = await Promise.all([
    prisma.patient.findMany({
      where: newClientWhere,
      select: {
        id: true,
        createdAt: true,
        gender: true,
        age: true,
        dateOfBirth: true,
        accountBalance: true,
        city: { select: { id: true, name: true } },
        village: { select: { id: true, name: true } },
        referralSource: { select: { id: true, name: true } },
      },
    }),
    prisma.patient.count({
      where: { createdAt: scope.previous.timestampFilter, ...registeredBranchWhere },
    }),
    prisma.patient.count({
      where: { createdAt: { lte: scope.timestampFilter.lte }, ...registeredBranchWhere },
    }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: appointmentWhere,
      _count: { id: true },
    }),
    prisma.patient.findMany({
      where: { accountBalance: { gt: 0 }, ...registeredBranchWhere },
      select: { id: true, accountBalance: true },
    }),
  ]);

  const newCount = newClients.length;

  const genderTotals = new Map<string, number>();
  const ageBandTotals = new Array(AGE_BANDS.length + 1).fill(0) as number[];
  const referralTotals = new Map<string, number>();
  const localityTotals = new Map<string, number>();
  let ageSum = 0;
  let ageKnown = 0;

  for (const client of newClients) {
    const gender = normaliseGender(client.gender);
    genderTotals.set(gender, (genderTotals.get(gender) ?? 0) + 1);

    const age = ageOf(client);
    if (age == null) {
      ageBandTotals[AGE_BANDS.length] += 1;
    } else {
      ageSum += age;
      ageKnown += 1;
      const index = AGE_BANDS.findIndex((band) => age >= band.min && age <= band.max);
      ageBandTotals[index >= 0 ? index : AGE_BANDS.length] += 1;
    }

    const referral = client.referralSource?.name ?? "Not recorded";
    referralTotals.set(referral, (referralTotals.get(referral) ?? 0) + 1);

    const locality = client.city?.name
      ? client.village?.name
        ? `${client.village.name}, ${client.city.name}`
        : client.city.name
      : "Not recorded";
    localityTotals.set(locality, (localityTotals.get(locality) ?? 0) + 1);
  }

  const registrationSeries = seriesFromBuckets(
    buckets,
    newClients.map((client) => ({ dayKey: timestampKey(client.createdAt), value: 1 }))
  );

  const visitFrequencyTotals = new Array(VISIT_FREQUENCY_BANDS.length).fill(0) as number[];
  let returningClients = 0;
  for (const group of visitGroups) {
    const visits = group._count.id;
    visitFrequencyTotals[visitFrequencyBand(visits)] += 1;
    if (visits > 1) returningClients += 1;
  }
  const activeClients = visitGroups.length;

  const genderRows = topN([...genderTotals.entries()], 6, ([, count]) => count);
  const referralRows = topN([...referralTotals.entries()], 8, ([, count]) => count);
  const localityRows = topN([...localityTotals.entries()], 12, ([, count]) => count);

  const outstandingTotal = round2(balanceRows.reduce((sum, row) => sum + row.accountBalance, 0));

  return {
    section: "clients",
    title: "Client analytics",
    description:
      "New registrations over time, gender and age profile, referral sources, locality spread, and returning-client rate.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "New clients are counted by registration date and the branch they were registered at. Demographics describe those new clients only.",
      "Active and returning clients are based on non-cancelled bookings in the range at the selected branch.",
      "Outstanding balances are current values, not limited to the selected date range.",
    ],
    kpis: [
      {
        key: "newClients",
        label: "New clients",
        value: newCount,
        format: "number",
        hint: "Registered in range",
        changePercent: percentChange(newCount, previousNewCount),
      },
      {
        key: "totalClients",
        label: "Total clients",
        value: cumulativeCount,
        format: "number",
        hint: "Registered to date",
      },
      { key: "activeClients", label: "Clients with visits", value: activeClients, format: "number", hint: "In range" },
      {
        key: "returningRate",
        label: "Returning rate",
        value: round2(safeDivide(returningClients, activeClients) * 100),
        format: "percent",
        hint: "More than one visit",
      },
      {
        key: "avgAge",
        label: "Average age",
        value: Math.round(safeDivide(ageSum, ageKnown)),
        format: "number",
        hint: ageKnown > 0 ? `${ageKnown} with age on file` : "No ages recorded",
      },
      {
        key: "newPerDay",
        label: "New per day",
        value: round2(safeDivide(newCount, scope.dayCount)),
        format: "number",
        hint: `Across ${scope.dayCount} day${scope.dayCount === 1 ? "" : "s"}`,
      },
      {
        key: "debtors",
        label: "Clients owing",
        value: balanceRows.length,
        format: "number",
        hint: "Positive balance now",
      },
      {
        key: "outstanding",
        label: "Outstanding balance",
        value: outstandingTotal,
        format: "currency",
        hint: "Current total owed",
      },
    ],
    charts: [
      {
        key: "registrations",
        title: "New client registrations",
        subtitle: buckets.granularity === "month" ? "Grouped by month" : "Grouped by day",
        type: "area",
        categories: buckets.labels,
        series: [{ name: "New clients", data: registrationSeries }],
        format: "number",
        span: 12,
      },
      {
        key: "gender",
        title: "Gender mix",
        subtitle: "New clients in range",
        type: "donut",
        categories: genderRows.map(([label]) => label),
        series: [{ name: "Clients", data: genderRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "ageBands",
        title: "Age profile",
        subtitle: "New clients in range",
        type: "bar",
        categories: [...AGE_BANDS.map((band) => band.label), "Unknown"],
        series: [{ name: "Clients", data: ageBandTotals }],
        format: "number",
        span: 6,
      },
      {
        key: "referral",
        title: "How clients found us",
        type: "donut",
        categories: referralRows.map(([label]) => label),
        series: [{ name: "Clients", data: referralRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "locality",
        title: "Top localities",
        type: "hbar",
        categories: localityRows.map(([label]) => label),
        series: [{ name: "Clients", data: localityRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "visitFrequency",
        title: "Visit frequency",
        subtitle: "Clients grouped by number of visits in range",
        type: "donut",
        categories: VISIT_FREQUENCY_BANDS,
        series: [{ name: "Clients", data: visitFrequencyTotals }],
        format: "number",
        span: 12,
      },
    ],
    tables: [
      {
        key: "registrationsByPeriod",
        title: `Registrations by ${buckets.granularity}`,
        columns: [
          { key: "period", label: buckets.granularity === "month" ? "Month" : "Date" },
          { key: "clients", label: "New clients", align: "right", format: "number" },
        ],
        rows: buckets.labels.map((label, i) => ({ period: label, clients: registrationSeries[i] ?? 0 })),
        totals: { period: "Total", clients: newCount },
      },
      {
        key: "localityTable",
        title: "Clients by locality",
        columns: [
          { key: "locality", label: "Locality" },
          { key: "clients", label: "New clients", align: "right", format: "number" },
          { key: "share", label: "Share", align: "right", format: "percent" },
        ],
        rows: localityRows.map(([label, count]) => ({
          locality: label,
          clients: count,
          share: round2(safeDivide(count, newCount) * 100),
        })),
      },
      {
        key: "referralTable",
        title: "Referral sources",
        columns: [
          { key: "source", label: "Source" },
          { key: "clients", label: "New clients", align: "right", format: "number" },
          { key: "share", label: "Share", align: "right", format: "percent" },
        ],
        rows: referralRows.map(([label, count]) => ({
          source: label,
          clients: count,
          share: round2(safeDivide(count, newCount) * 100),
        })),
      },
      {
        key: "retentionTable",
        title: "Retention summary",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value", align: "right", format: "number" },
        ],
        rows: [
          { metric: "Clients with at least one visit", value: activeClients },
          { metric: "Clients with more than one visit", value: returningClients },
          { metric: "Clients seen once only", value: visitFrequencyTotals[0] ?? 0 },
          { metric: "Clients seen 7+ times", value: visitFrequencyTotals[3] ?? 0 },
        ],
      },
    ],
  };
}
