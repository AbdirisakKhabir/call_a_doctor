import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AnalyticsReport } from "@/lib/analytics/types";
import {
  buildTimeBuckets,
  dateOnlyKey,
  percentChange,
  round2,
  safeDivide,
  seriesFromBuckets,
  timestampKey,
  topN,
  type AnalyticsScope,
} from "@/lib/analytics/scope";

/**
 * Revenue is split into three non-overlapping streams so nothing is double counted:
 * booked service charges (AppointmentService), pharmacy retail (Sale kind=pos), and lab fees
 * (LabOrder). Visit-billing sales are the settlement of AppointmentService lines, so they are
 * deliberately excluded from the retail stream.
 */
export async function buildRevenueReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const buckets = buildTimeBuckets(scope);
  const hasBranchScope = Object.keys(scope.branchWhere).length > 0;

  const appointmentWhere: Prisma.AppointmentWhereInput = {
    status: { not: "cancelled" },
    appointmentDate: scope.dateOnlyFilter,
    ...scope.branchWhere,
  };
  const previousAppointmentWhere: Prisma.AppointmentWhereInput = {
    ...appointmentWhere,
    appointmentDate: scope.previous.dateOnlyFilter,
  };

  const posWhere: Prisma.SaleWhereInput = {
    kind: "pos",
    saleDate: scope.timestampFilter,
    ...scope.branchWhere,
  };
  const previousPosWhere: Prisma.SaleWhereInput = { ...posWhere, saleDate: scope.previous.timestampFilter };

  const labWhere: Prisma.LabOrderWhereInput = {
    status: { not: "cancelled" },
    createdAt: scope.timestampFilter,
    ...(hasBranchScope ? { appointment: scope.branchWhere } : {}),
  };
  const previousLabWhere: Prisma.LabOrderWhereInput = { ...labWhere, createdAt: scope.previous.timestampFilter };

  const expenseWhere: Prisma.ExpenseWhereInput = { expenseDate: scope.dateOnlyFilter };
  const previousExpenseWhere: Prisma.ExpenseWhereInput = { expenseDate: scope.previous.dateOnlyFilter };

  const [
    serviceLines,
    previousServiceTotal,
    posSales,
    previousPosTotal,
    labOrders,
    previousLabTotal,
    expenses,
    previousExpenseTotal,
  ] = await Promise.all([
    prisma.appointmentService.findMany({
      where: { appointment: appointmentWhere },
      select: {
        totalAmount: true,
        quantity: true,
        service: { select: { id: true, name: true } },
        appointment: { select: { appointmentDate: true } },
      },
    }),
    prisma.appointmentService.aggregate({
      where: { appointment: previousAppointmentWhere },
      _sum: { totalAmount: true },
    }),
    prisma.sale.findMany({
      where: posWhere,
      select: { saleDate: true, totalAmount: true, discount: true, paymentMethod: true },
    }),
    prisma.sale.aggregate({ where: previousPosWhere, _sum: { totalAmount: true } }),
    prisma.labOrder.findMany({
      where: labWhere,
      select: { createdAt: true, totalAmount: true, labFeePaidAmount: true, labFeeDiscountAmount: true },
    }),
    prisma.labOrder.aggregate({ where: previousLabWhere, _sum: { totalAmount: true } }),
    prisma.expense.findMany({
      where: expenseWhere,
      select: { expenseDate: true, amount: true, category: { select: { id: true, name: true } } },
    }),
    prisma.expense.aggregate({ where: previousExpenseWhere, _sum: { amount: true } }),
  ]);

  const serviceRevenue = round2(serviceLines.reduce((sum, row) => sum + row.totalAmount, 0));
  const posRevenue = round2(posSales.reduce((sum, row) => sum + row.totalAmount, 0));
  const labRevenue = round2(labOrders.reduce((sum, row) => sum + row.totalAmount, 0));
  const expenseTotal = round2(expenses.reduce((sum, row) => sum + row.amount, 0));
  const totalRevenue = round2(serviceRevenue + posRevenue + labRevenue);
  const netIncome = round2(totalRevenue - expenseTotal);

  const previousTotalRevenue = round2(
    (previousServiceTotal._sum.totalAmount ?? 0) +
      (previousPosTotal._sum.totalAmount ?? 0) +
      (previousLabTotal._sum.totalAmount ?? 0)
  );
  const previousExpenses = round2(previousExpenseTotal._sum.amount ?? 0);

  const serviceSeries = seriesFromBuckets(
    buckets,
    serviceLines.map((row) => ({
      dayKey: dateOnlyKey(row.appointment.appointmentDate),
      value: row.totalAmount,
    }))
  );
  const posSeries = seriesFromBuckets(
    buckets,
    posSales.map((row) => ({ dayKey: timestampKey(row.saleDate), value: row.totalAmount }))
  );
  const labSeries = seriesFromBuckets(
    buckets,
    labOrders.map((row) => ({ dayKey: timestampKey(row.createdAt), value: row.totalAmount }))
  );
  const expenseSeries = seriesFromBuckets(
    buckets,
    expenses.map((row) => ({ dayKey: dateOnlyKey(row.expenseDate), value: row.amount }))
  );
  const revenueSeries = buckets.keys.map((_, i) =>
    round2((serviceSeries[i] ?? 0) + (posSeries[i] ?? 0) + (labSeries[i] ?? 0))
  );

  const paymentMethodTotals = new Map<string, number>();
  for (const sale of posSales) {
    const label = sale.paymentMethod?.trim() || "Unspecified";
    paymentMethodTotals.set(label, (paymentMethodTotals.get(label) ?? 0) + sale.totalAmount);
  }
  const paymentRows = topN([...paymentMethodTotals.entries()], 8, ([, amount]) => amount);

  const expenseCategoryTotals = new Map<string, number>();
  for (const expense of expenses) {
    const label = expense.category?.name ?? "Uncategorised";
    expenseCategoryTotals.set(label, (expenseCategoryTotals.get(label) ?? 0) + expense.amount);
  }
  const expenseRows = topN([...expenseCategoryTotals.entries()], 12, ([, amount]) => amount);

  const serviceTotals = new Map<number, { name: string; revenue: number; quantity: number }>();
  for (const line of serviceLines) {
    const existing = serviceTotals.get(line.service.id) ?? { name: line.service.name, revenue: 0, quantity: 0 };
    existing.revenue += line.totalAmount;
    existing.quantity += line.quantity;
    serviceTotals.set(line.service.id, existing);
  }
  const topServices = topN([...serviceTotals.values()], 10, (row) => row.revenue);

  const labCollected = round2(labOrders.reduce((sum, row) => sum + row.labFeePaidAmount, 0));
  const discountTotal = round2(posSales.reduce((sum, row) => sum + row.discount, 0));

  return {
    section: "revenue",
    title: "Revenue & finance analytics",
    description:
      "Income by source, daily revenue trend, payment method mix, operating expenses, and net position.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "Revenue streams are non-overlapping: booked service charges, pharmacy retail sales, and lab fees. Cancelled bookings and cancelled lab orders are excluded.",
      "Expenses are recorded clinic-wide and are not filtered by branch, so the net figure covers all branches even when a single branch is selected.",
    ],
    kpis: [
      {
        key: "totalRevenue",
        label: "Total revenue",
        value: totalRevenue,
        format: "currency",
        hint: "Services + pharmacy + lab",
        changePercent: percentChange(totalRevenue, previousTotalRevenue),
      },
      {
        key: "serviceRevenue",
        label: "Service revenue",
        value: serviceRevenue,
        format: "currency",
        hint: "Charges on booked visits",
      },
      {
        key: "posRevenue",
        label: "Pharmacy revenue",
        value: posRevenue,
        format: "currency",
        hint: "Point-of-sale takings",
      },
      { key: "labRevenue", label: "Lab revenue", value: labRevenue, format: "currency", hint: "Ordered test fees" },
      {
        key: "expenses",
        label: "Operating expenses",
        value: expenseTotal,
        format: "currency",
        hint: "All branches",
        changePercent: percentChange(expenseTotal, previousExpenses),
      },
      {
        key: "netIncome",
        label: "Net position",
        value: netIncome,
        format: "currency",
        hint: "Revenue less expenses",
      },
      {
        key: "avgDailyRevenue",
        label: "Average per day",
        value: round2(safeDivide(totalRevenue, scope.dayCount)),
        format: "currency",
        hint: `Across ${scope.dayCount} day${scope.dayCount === 1 ? "" : "s"}`,
      },
      {
        key: "labCollectionRate",
        label: "Lab collection rate",
        value: round2(safeDivide(labCollected, labRevenue) * 100),
        format: "percent",
        hint: "Lab fees received vs billed",
      },
    ],
    charts: [
      {
        key: "revenueTrend",
        title: "Revenue trend by source",
        subtitle: buckets.granularity === "month" ? "Grouped by month" : "Grouped by day",
        type: "area",
        categories: buckets.labels,
        series: [
          { name: "Services", data: serviceSeries },
          { name: "Pharmacy", data: posSeries },
          { name: "Lab", data: labSeries },
        ],
        format: "currency",
        span: 12,
      },
      {
        key: "revenueMix",
        title: "Revenue by source",
        type: "donut",
        categories: ["Services", "Pharmacy", "Lab"],
        series: [{ name: "Revenue", data: [serviceRevenue, posRevenue, labRevenue] }],
        format: "currency",
        span: 6,
      },
      {
        key: "paymentMethods",
        title: "Pharmacy payment methods",
        subtitle: "Point-of-sale takings by method",
        type: "donut",
        categories: paymentRows.map(([label]) => label),
        series: [{ name: "Revenue", data: paymentRows.map(([, amount]) => round2(amount)) }],
        format: "currency",
        span: 6,
      },
      {
        key: "revenueVsExpenses",
        title: "Revenue vs expenses",
        subtitle: "Expenses are clinic-wide",
        type: "bar",
        categories: buckets.labels,
        series: [
          { name: "Revenue", data: revenueSeries },
          { name: "Expenses", data: expenseSeries },
        ],
        format: "currency",
        span: 12,
      },
      {
        key: "expenseCategories",
        title: "Expenses by category",
        type: "hbar",
        categories: expenseRows.map(([label]) => label),
        series: [{ name: "Expenses", data: expenseRows.map(([, amount]) => round2(amount)) }],
        format: "currency",
        span: 6,
      },
      {
        key: "topServices",
        title: "Top services by revenue",
        type: "hbar",
        categories: topServices.map((row) => row.name),
        series: [{ name: "Revenue", data: topServices.map((row) => round2(row.revenue)) }],
        format: "currency",
        span: 6,
      },
    ],
    tables: [
      {
        key: "revenueByPeriod",
        title: `Revenue by ${buckets.granularity}`,
        columns: [
          { key: "period", label: buckets.granularity === "month" ? "Month" : "Date" },
          { key: "services", label: "Services", align: "right", format: "currency" },
          { key: "pharmacy", label: "Pharmacy", align: "right", format: "currency" },
          { key: "lab", label: "Lab", align: "right", format: "currency" },
          { key: "total", label: "Total", align: "right", format: "currency" },
        ],
        rows: buckets.labels.map((label, i) => ({
          period: label,
          services: serviceSeries[i] ?? 0,
          pharmacy: posSeries[i] ?? 0,
          lab: labSeries[i] ?? 0,
          total: revenueSeries[i] ?? 0,
        })),
        totals: {
          period: "Total",
          services: serviceRevenue,
          pharmacy: posRevenue,
          lab: labRevenue,
          total: totalRevenue,
        },
      },
      {
        key: "topServicesTable",
        title: "Top services by revenue",
        columns: [
          { key: "service", label: "Service" },
          { key: "quantity", label: "Units", align: "right", format: "number" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        ],
        rows: topServices.map((row) => ({
          service: row.name,
          quantity: row.quantity,
          revenue: round2(row.revenue),
        })),
      },
      {
        key: "expenseTable",
        title: "Expenses by category",
        subtitle: "Clinic-wide, not filtered by branch",
        columns: [
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
        ],
        rows: expenseRows.map(([label, amount]) => ({ category: label, amount: round2(amount) })),
        totals: { category: "Total", amount: expenseTotal },
      },
      {
        key: "discountSummary",
        title: "Discounts and collections",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "amount", label: "Amount", align: "right", format: "currency" },
        ],
        rows: [
          { metric: "Pharmacy discounts given", amount: discountTotal },
          { metric: "Lab fees billed", amount: labRevenue },
          { metric: "Lab fees collected", amount: labCollected },
          { metric: "Lab fees outstanding", amount: round2(labRevenue - labCollected) },
        ],
      },
    ],
  };
}
