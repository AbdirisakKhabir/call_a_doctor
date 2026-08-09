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

/** Products at or below this on-hand quantity are flagged as a restock risk. */
const LOW_STOCK_THRESHOLD = 10;

function customerTypeLabel(value: string): string {
  if (value === "walking") return "Walk-in";
  if (value === "patient") return "Registered client";
  if (value === "outreach") return "Outreach team";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function buildPharmacyReport(scope: AnalyticsScope): Promise<AnalyticsReport> {
  const buckets = buildTimeBuckets(scope);

  const posWhere: Prisma.SaleWhereInput = {
    kind: "pos",
    saleDate: scope.timestampFilter,
    ...scope.branchWhere,
  };
  const previousPosWhere: Prisma.SaleWhereInput = { ...posWhere, saleDate: scope.previous.timestampFilter };

  const [sales, previousAggregate, saleItems, products] = await Promise.all([
    prisma.sale.findMany({
      where: posWhere,
      select: { id: true, saleDate: true, totalAmount: true, discount: true, paymentMethod: true, customerType: true },
    }),
    prisma.sale.aggregate({ where: previousPosWhere, _sum: { totalAmount: true }, _count: { id: true } }),
    prisma.saleItem.findMany({
      where: { sale: posWhere, productId: { not: null } },
      select: {
        quantity: true,
        totalAmount: true,
        sale: { select: { saleDate: true } },
        product: {
          select: { id: true, name: true, code: true, costPrice: true, category: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true, forSale: true, ...scope.branchWhere },
      select: { id: true, name: true, code: true, quantity: true, costPrice: true, sellingPrice: true },
    }),
  ]);

  const revenue = round2(sales.reduce((sum, row) => sum + row.totalAmount, 0));
  const discounts = round2(sales.reduce((sum, row) => sum + row.discount, 0));
  const transactions = sales.length;
  const unitsSold = saleItems.reduce((sum, row) => sum + row.quantity, 0);

  const costOfGoods = round2(
    saleItems.reduce((sum, row) => sum + (row.product?.costPrice ?? 0) * row.quantity, 0)
  );
  const itemRevenue = round2(saleItems.reduce((sum, row) => sum + row.totalAmount, 0));
  const grossMargin = round2(itemRevenue - costOfGoods);

  const previousRevenue = round2(previousAggregate._sum.totalAmount ?? 0);
  const previousTransactions = previousAggregate._count.id;

  const revenueSeries = seriesFromBuckets(
    buckets,
    sales.map((row) => ({ dayKey: timestampKey(row.saleDate), value: row.totalAmount }))
  );
  const transactionSeries = seriesFromBuckets(
    buckets,
    sales.map((row) => ({ dayKey: timestampKey(row.saleDate), value: 1 }))
  );
  const costSeries = seriesFromBuckets(
    buckets,
    saleItems.map((row) => ({
      dayKey: timestampKey(row.sale.saleDate),
      value: (row.product?.costPrice ?? 0) * row.quantity,
    }))
  );

  const productTotals = new Map<
    number,
    { name: string; code: string; units: number; revenue: number; cost: number }
  >();
  const categoryTotals = new Map<string, number>();
  for (const item of saleItems) {
    if (!item.product) continue;
    const existing =
      productTotals.get(item.product.id) ??
      { name: item.product.name, code: item.product.code, units: 0, revenue: 0, cost: 0 };
    existing.units += item.quantity;
    existing.revenue += item.totalAmount;
    existing.cost += item.product.costPrice * item.quantity;
    productTotals.set(item.product.id, existing);

    const categoryName = item.product.category?.name ?? "Uncategorised";
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + item.totalAmount);
  }

  const topProducts = topN([...productTotals.values()], 12, (row) => row.revenue);
  const categoryRows = topN([...categoryTotals.entries()], 10, ([, amount]) => amount);

  const paymentTotals = new Map<string, number>();
  const customerTypeTotals = new Map<string, number>();
  for (const sale of sales) {
    const method = sale.paymentMethod?.trim() || "Unspecified";
    paymentTotals.set(method, (paymentTotals.get(method) ?? 0) + sale.totalAmount);
    const customer = customerTypeLabel(sale.customerType);
    customerTypeTotals.set(customer, (customerTypeTotals.get(customer) ?? 0) + sale.totalAmount);
  }
  const paymentRows = topN([...paymentTotals.entries()], 8, ([, amount]) => amount);
  const customerRows = topN([...customerTypeTotals.entries()], 6, ([, amount]) => amount);

  const outOfStock = products.filter((p) => p.quantity <= 0);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= LOW_STOCK_THRESHOLD);
  const stockValue = round2(products.reduce((sum, p) => sum + p.costPrice * Math.max(0, p.quantity), 0));
  const restockRows = [...outOfStock, ...lowStock]
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name))
    .slice(0, 20);

  return {
    section: "pharmacy",
    title: "Pharmacy analytics",
    description:
      "Point-of-sale revenue and margin, best-selling products, category mix, basket size, and stock risk.",
    range: { from: scope.from, to: scope.to },
    branchLabel: scope.branchLabel,
    notes: [
      "Only retail point-of-sale activity is included. Visit billing lines are covered by the revenue report instead.",
      "Margin uses the product's current cost price, so historic cost changes are not reflected.",
      `Stock figures are live on-hand quantities for sellable products; low stock means ${LOW_STOCK_THRESHOLD} units or fewer.`,
    ],
    kpis: [
      {
        key: "revenue",
        label: "Pharmacy revenue",
        value: revenue,
        format: "currency",
        hint: "Point-of-sale takings",
        changePercent: percentChange(revenue, previousRevenue),
      },
      {
        key: "transactions",
        label: "Transactions",
        value: transactions,
        format: "number",
        hint: "Completed sales",
        changePercent: percentChange(transactions, previousTransactions),
      },
      { key: "units", label: "Units sold", value: unitsSold, format: "number", hint: "Across all products" },
      {
        key: "basket",
        label: "Average basket",
        value: round2(safeDivide(revenue, transactions)),
        format: "currency",
        hint: "Revenue per transaction",
      },
      { key: "margin", label: "Gross margin", value: grossMargin, format: "currency", hint: "Revenue less cost" },
      {
        key: "marginRate",
        label: "Margin rate",
        value: round2(safeDivide(grossMargin, itemRevenue) * 100),
        format: "percent",
        hint: "Margin as share of sales",
      },
      { key: "discounts", label: "Discounts given", value: discounts, format: "currency", hint: "Total reductions" },
      {
        key: "stockValue",
        label: "Stock value at cost",
        value: stockValue,
        format: "currency",
        hint: `${products.length} sellable products`,
      },
    ],
    charts: [
      {
        key: "salesTrend",
        title: "Pharmacy revenue trend",
        subtitle: buckets.granularity === "month" ? "Grouped by month" : "Grouped by day",
        type: "area",
        categories: buckets.labels,
        series: [{ name: "Revenue", data: revenueSeries }],
        format: "currency",
        span: 12,
      },
      {
        key: "topProducts",
        title: "Best sellers by revenue",
        type: "hbar",
        categories: topProducts.map((row) => row.name),
        series: [{ name: "Revenue", data: topProducts.map((row) => round2(row.revenue)) }],
        format: "currency",
        span: 6,
      },
      {
        key: "categoryMix",
        title: "Revenue by category",
        type: "donut",
        categories: categoryRows.map(([label]) => label),
        series: [{ name: "Revenue", data: categoryRows.map(([, amount]) => round2(amount)) }],
        format: "currency",
        span: 6,
      },
      {
        key: "revenueVsCost",
        title: "Revenue vs cost of goods",
        type: "bar",
        categories: buckets.labels,
        series: [
          { name: "Revenue", data: revenueSeries },
          { name: "Cost of goods", data: costSeries },
        ],
        format: "currency",
        span: 12,
      },
      {
        key: "paymentMethods",
        title: "Payment methods",
        type: "donut",
        categories: paymentRows.map(([label]) => label),
        series: [{ name: "Revenue", data: paymentRows.map(([, amount]) => round2(amount)) }],
        format: "currency",
        span: 6,
      },
      {
        key: "customerTypes",
        title: "Revenue by customer type",
        type: "donut",
        categories: customerRows.map(([label]) => label),
        series: [{ name: "Revenue", data: customerRows.map(([, amount]) => round2(amount)) }],
        format: "currency",
        span: 6,
      },
    ],
    tables: [
      {
        key: "salesByPeriod",
        title: `Sales by ${buckets.granularity}`,
        columns: [
          { key: "period", label: buckets.granularity === "month" ? "Month" : "Date" },
          { key: "transactions", label: "Transactions", align: "right", format: "number" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
        ],
        rows: buckets.labels.map((label, i) => ({
          period: label,
          transactions: transactionSeries[i] ?? 0,
          revenue: revenueSeries[i] ?? 0,
        })),
        totals: { period: "Total", transactions, revenue },
      },
      {
        key: "productTable",
        title: "Best selling products",
        columns: [
          { key: "product", label: "Product" },
          { key: "code", label: "Code" },
          { key: "units", label: "Units", align: "right", format: "number" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
          { key: "margin", label: "Margin", align: "right", format: "currency" },
        ],
        rows: topProducts.map((row) => ({
          product: row.name,
          code: row.code,
          units: row.units,
          revenue: round2(row.revenue),
          margin: round2(row.revenue - row.cost),
        })),
      },
      {
        key: "categoryTable",
        title: "Category performance",
        columns: [
          { key: "category", label: "Category" },
          { key: "revenue", label: "Revenue", align: "right", format: "currency" },
          { key: "share", label: "Share", align: "right", format: "percent" },
        ],
        rows: categoryRows.map(([label, amount]) => ({
          category: label,
          revenue: round2(amount),
          share: round2(safeDivide(amount, itemRevenue) * 100),
        })),
      },
      {
        key: "restockTable",
        title: "Restock watchlist",
        subtitle: `${outOfStock.length} out of stock, ${lowStock.length} running low`,
        columns: [
          { key: "product", label: "Product" },
          { key: "code", label: "Code" },
          { key: "quantity", label: "On hand", align: "right", format: "number" },
          { key: "value", label: "Value at cost", align: "right", format: "currency" },
        ],
        rows: restockRows.map((row) => ({
          product: row.name,
          code: row.code,
          quantity: row.quantity,
          value: round2(row.costPrice * Math.max(0, row.quantity)),
        })),
      },
    ],
  };
}
