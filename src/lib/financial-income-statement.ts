import type { PrismaClient } from "@prisma/client";

/** One display row on the income statement (revenue or expense). */
export type IncomeStatementLine = {
  id: string;
  label: string;
  amount: number;
  /** When true, amount is shown as a deduction from subtotal (e.g. returns). Stored as a positive number. */
  isDeduction?: boolean;
};

export type IncomeStatementResult = {
  revenue: {
    lines: IncomeStatementLine[];
    grossRevenue: number;
    /** Sum of pharmacy sale returns (positive number; subtracted to reach `total`). */
    pharmacyReturns: number;
    total: number;
  };
  expenses: {
    lines: IncomeStatementLine[];
    total: number;
  };
  netIncome: number;
};

/**
 * Accrual-style summary for management reporting:
 * - POS / pharmacy sales split by channel (in-clinic vs outreach)
 * - Visit billing as `Sale` rows with kind `appointment` (not `Appointment.totalAmount`, to avoid double counting)
 * - Lab counter sales (`LabSale`)
 * - Pharmacy returns reduce revenue
 */
export async function computeIncomeStatement(
  prisma: PrismaClient,
  dateFilter: { gte?: Date; lte?: Date }
): Promise<IncomeStatementResult> {
  const hasFilter = Object.keys(dateFilter).length > 0;
  const saleDateWhere = hasFilter ? { saleDate: dateFilter } : {};
  const labSaleDateWhere = hasFilter ? { saleDate: dateFilter } : {};
  const returnDateWhere = hasFilter ? { returnDate: dateFilter } : {};
  const purchaseDateWhere = hasFilter ? { purchaseDate: dateFilter } : {};
  const expenseDateWhere = hasFilter ? { expenseDate: dateFilter } : {};

  const [
    posInClinic,
    posOutreach,
    visitBilling,
    labSales,
    pharmacyReturns,
    purchases,
    expenses,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...saleDateWhere, kind: "pos", customerType: { not: "outreach" } },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: { ...saleDateWhere, kind: "pos", customerType: "outreach" },
      _sum: { totalAmount: true },
    }),
    prisma.sale.aggregate({
      where: { ...saleDateWhere, kind: "appointment" },
      _sum: { totalAmount: true },
    }),
    prisma.labSale.aggregate({
      where: labSaleDateWhere,
      _sum: { totalAmount: true },
    }),
    prisma.pharmacySaleReturn.aggregate({
      where: returnDateWhere,
      _sum: { totalAmount: true },
    }),
    prisma.purchase.aggregate({
      where: purchaseDateWhere,
      _sum: { totalAmount: true },
    }),
    prisma.expense.aggregate({
      where: expenseDateWhere,
      _sum: { amount: true },
    }),
  ]);

  const pharmacyPosInClinic = posInClinic._sum.totalAmount ?? 0;
  const pharmacyPosOutreach = posOutreach._sum.totalAmount ?? 0;
  const visitBillingTotal = visitBilling._sum.totalAmount ?? 0;
  const labSalesTotal = labSales._sum.totalAmount ?? 0;
  const returnsTotal = pharmacyReturns._sum.totalAmount ?? 0;

  const revenueLines: IncomeStatementLine[] = [
    {
      id: "pharmacy_pos_in_clinic",
      label: "In-clinic pharmacy & retail (POS)",
      amount: pharmacyPosInClinic,
    },
    {
      id: "pharmacy_pos_outreach",
      label: "Outreach / field pharmacy sales",
      amount: pharmacyPosOutreach,
    },
    {
      id: "visit_billing",
      label: "Visit services (calendar billing)",
      amount: visitBillingTotal,
    },
    {
      id: "lab_sales",
      label: "Laboratory test sales",
      amount: labSalesTotal,
    },
  ];

  if (returnsTotal > 0) {
    revenueLines.push({
      id: "pharmacy_returns",
      label: "Pharmacy sale returns",
      amount: returnsTotal,
      isDeduction: true,
    });
  }

  const grossRevenue =
    pharmacyPosInClinic + pharmacyPosOutreach + visitBillingTotal + labSalesTotal;
  const totalRevenue = grossRevenue - returnsTotal;

  const purchaseCost = purchases._sum.totalAmount ?? 0;
  const operatingExpenses = expenses._sum.amount ?? 0;
  const totalExpenses = purchaseCost + operatingExpenses;

  const expenseLines: IncomeStatementLine[] = [
    {
      id: "stock_purchases",
      label: "Pharmacy & inventory purchases",
      amount: purchaseCost,
    },
    {
      id: "operating",
      label: "Operating expenses",
      amount: operatingExpenses,
    },
  ];

  const netIncome = totalRevenue - totalExpenses;

  return {
    revenue: {
      lines: revenueLines,
      grossRevenue,
      pharmacyReturns: returnsTotal,
      total: totalRevenue,
    },
    expenses: {
      lines: expenseLines,
      total: totalExpenses,
    },
    netIncome,
  };
}
