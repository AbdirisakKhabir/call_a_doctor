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

const HOUR_MS = 60 * 60 * 1000;
const TURNAROUND_BANDS: { label: string; maxHours: number }[] = [
  { label: "Under 2 hours", maxHours: 2 },
  { label: "2–8 hours", maxHours: 8 },
  { label: "8–24 hours", maxHours: 24 },
  { label: "1–3 days", maxHours: 72 },
  { label: "Over 3 days", maxHours: Number.POSITIVE_INFINITY },
];

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export async function buildLabReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const buckets = buildTimeBuckets(scope);
  const hasBranchScope = Object.keys(scope.branchWhere).length > 0;

  const orderWhere: Prisma.LabOrderWhereInput = {
    createdAt: scope.timestampFilter,
    ...(hasBranchScope ? { appointment: scope.branchWhere } : {}),
  };
  const previousOrderWhere: Prisma.LabOrderWhereInput = {
    ...orderWhere,
    createdAt: scope.previous.timestampFilter,
  };

  const [orders, previousCount, items] = await Promise.all([
    prisma.labOrder.findMany({
      where: orderWhere,
      select: {
        id: true,
        createdAt: true,
        status: true,
        totalAmount: true,
        labFeePaidAmount: true,
        labFeeDiscountAmount: true,
        patientId: true,
      },
    }),
    prisma.labOrder.count({ where: previousOrderWhere }),
    prisma.labOrderItem.findMany({
      where: { labOrder: orderWhere },
      select: {
        unitPrice: true,
        status: true,
        recordedAt: true,
        labOrder: { select: { createdAt: true } },
        labTest: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const totalOrders = orders.length;
  const statusTotals = new Map<string, number>();
  const uniqueClients = new Set<number>();
  let billed = 0;
  let collected = 0;
  let discounted = 0;

  for (const order of orders) {
    statusTotals.set(order.status, (statusTotals.get(order.status) ?? 0) + 1);
    uniqueClients.add(order.patientId);
    billed += order.totalAmount;
    collected += order.labFeePaidAmount;
    discounted += order.labFeeDiscountAmount;
  }

  billed = round2(billed);
  collected = round2(collected);
  discounted = round2(discounted);

  const completedOrders = statusTotals.get("completed") ?? 0;
  const pendingOrders = statusTotals.get("pending") ?? 0;

  const statusRows = [...statusTotals.entries()].sort((a, b) => b[1] - a[1]);
  const statusSeries = statusRows.map(([status]) => ({
    name: statusLabel(status),
    data: seriesFromBuckets(
      buckets,
      orders
        .filter((order) => order.status === status)
        .map((order) => ({ dayKey: timestampKey(order.createdAt), value: 1 }))
    ),
  }));

  const orderSeries = seriesFromBuckets(
    buckets,
    orders.map((order) => ({ dayKey: timestampKey(order.createdAt), value: 1 }))
  );
  const revenueSeries = seriesFromBuckets(
    buckets,
    orders.map((order) => ({ dayKey: timestampKey(order.createdAt), value: order.totalAmount }))
  );
  const collectedSeries = seriesFromBuckets(
    buckets,
    orders.map((order) => ({ dayKey: timestampKey(order.createdAt), value: order.labFeePaidAmount }))
  );

  const testTotals = new Map<number, { name: string; count: number; revenue: number; completed: number }>();
  const categoryTotals = new Map<string, number>();
  const turnaroundBandTotals = new Array(TURNAROUND_BANDS.length).fill(0) as number[];
  let turnaroundSum = 0;
  let turnaroundCount = 0;

  for (const item of items) {
    const existing =
      testTotals.get(item.labTest.id) ?? { name: item.labTest.name, count: 0, revenue: 0, completed: 0 };
    existing.count += 1;
    existing.revenue += item.unitPrice;
    if (item.status === "completed") existing.completed += 1;
    testTotals.set(item.labTest.id, existing);

    const categoryName = item.labTest.category?.name ?? "Uncategorised";
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + 1);

    if (item.recordedAt) {
      const hours = (item.recordedAt.getTime() - item.labOrder.createdAt.getTime()) / HOUR_MS;
      if (hours >= 0) {
        turnaroundSum += hours;
        turnaroundCount += 1;
        const bandIndex = TURNAROUND_BANDS.findIndex((band) => hours <= band.maxHours);
        turnaroundBandTotals[bandIndex >= 0 ? bandIndex : TURNAROUND_BANDS.length - 1] += 1;
      }
    }
  }

  const testRows = [...testTotals.values()];
  const topTests = topN(testRows, 12, (row) => row.count);
  const categoryRows = topN([...categoryTotals.entries()], 10, ([, count]) => count);
  const completedItems = items.filter((item) => item.status === "completed").length;

  return {
    section: "lab",
    title: "Laboratory analytics",
    description:
      "Order volume and completion, most requested tests, lab fee revenue and collection rate, and result turnaround.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "Orders are counted by the date they were raised. Branch comes from the linked booking.",
      "Turnaround measures the time from raising the order to recording each result, so it only covers completed test lines.",
    ],
    kpis: [
      {
        key: "orders",
        label: "Lab orders",
        value: totalOrders,
        format: "number",
        hint: "Raised in range",
        changePercent: percentChange(totalOrders, previousCount),
      },
      { key: "completed", label: "Completed orders", value: completedOrders, format: "number", hint: "All results in" },
      { key: "pending", label: "Pending orders", value: pendingOrders, format: "number", hint: "Awaiting results" },
      {
        key: "completionRate",
        label: "Completion rate",
        value: round2(safeDivide(completedOrders, totalOrders) * 100),
        format: "percent",
        hint: "Completed of all orders",
      },
      { key: "tests", label: "Tests requested", value: items.length, format: "number", hint: `${completedItems} resulted` },
      { key: "billed", label: "Lab fees billed", value: billed, format: "currency", hint: "Charged to clients" },
      {
        key: "collectionRate",
        label: "Collection rate",
        value: round2(safeDivide(collected, billed) * 100),
        format: "percent",
        hint: `${collected.toFixed(2)} collected`,
      },
      {
        key: "turnaround",
        label: "Average turnaround",
        value: round2(safeDivide(turnaroundSum, turnaroundCount)),
        format: "number",
        hint: turnaroundCount > 0 ? "Hours to result" : "No results recorded",
      },
    ],
    charts: [
      {
        key: "ordersOverTime",
        title: "Lab orders over time",
        subtitle: buckets.granularity === "month" ? "Grouped by month" : "Grouped by day",
        type: "bar",
        categories: buckets.labels,
        series: statusSeries.length > 0 ? statusSeries : [{ name: "Orders", data: orderSeries }],
        format: "number",
        span: 12,
        stacked: true,
      },
      {
        key: "statusMix",
        title: "Order status",
        type: "donut",
        categories: statusRows.map(([status]) => statusLabel(status)),
        series: [{ name: "Orders", data: statusRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "topTests",
        title: "Most requested tests",
        type: "hbar",
        categories: topTests.map((row) => row.name),
        series: [{ name: "Tests", data: topTests.map((row) => row.count) }],
        format: "number",
        span: 6,
      },
      {
        key: "feeTrend",
        title: "Lab fees billed vs collected",
        type: "area",
        categories: buckets.labels,
        series: [
          { name: "Billed", data: revenueSeries },
          { name: "Collected", data: collectedSeries },
        ],
        format: "currency",
        span: 12,
      },
      {
        key: "categoryMix",
        title: "Tests by category",
        type: "donut",
        categories: categoryRows.map(([label]) => label),
        series: [{ name: "Tests", data: categoryRows.map(([, count]) => count) }],
        format: "number",
        span: 6,
      },
      {
        key: "turnaroundBands",
        title: "Result turnaround",
        subtitle: "Time from order to recorded result",
        type: "bar",
        categories: TURNAROUND_BANDS.map((band) => band.label),
        series: [{ name: "Results", data: turnaroundBandTotals }],
        format: "number",
        span: 6,
      },
    ],
    tables: [
      {
        key: "ordersByPeriod",
        title: `Orders by ${buckets.granularity}`,
        columns: [
          { key: "period", label: buckets.granularity === "month" ? "Month" : "Date" },
          { key: "orders", label: "Orders", align: "right", format: "number" },
          { key: "billed", label: "Billed", align: "right", format: "currency" },
          { key: "collected", label: "Collected", align: "right", format: "currency" },
        ],
        rows: buckets.labels.map((label, i) => ({
          period: label,
          orders: orderSeries[i] ?? 0,
          billed: revenueSeries[i] ?? 0,
          collected: collectedSeries[i] ?? 0,
        })),
        totals: { period: "Total", orders: totalOrders, billed, collected },
      },
      {
        key: "testTable",
        title: "Most requested tests",
        columns: [
          { key: "test", label: "Test" },
          { key: "count", label: "Requested", align: "right", format: "number" },
          { key: "completed", label: "Resulted", align: "right", format: "number" },
          { key: "revenue", label: "Fees", align: "right", format: "currency" },
        ],
        rows: topN(testRows, 25, (row) => row.count).map((row) => ({
          test: row.name,
          count: row.count,
          completed: row.completed,
          revenue: round2(row.revenue),
        })),
      },
      {
        key: "categoryTable",
        title: "Tests by category",
        columns: [
          { key: "category", label: "Category" },
          { key: "tests", label: "Tests", align: "right", format: "number" },
          { key: "share", label: "Share", align: "right", format: "percent" },
        ],
        rows: categoryRows.map(([label, count]) => ({
          category: label,
          tests: count,
          share: round2(safeDivide(count, items.length) * 100),
        })),
      },
      {
        key: "collectionTable",
        title: "Fee collection",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
        ],
        rows: [
          { metric: "Billed", amount: billed },
          { metric: "Collected", amount: collected },
          { metric: "Discounted or written off", amount: discounted },
          { metric: "Outstanding", amount: round2(billed - collected - discounted) },
        ],
      },
    ],
  };
}
