import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }

    const saleDateFilter = Object.keys(dateFilter).length ? { saleDate: dateFilter } : {};
    const appointmentDateFilter = Object.keys(dateFilter).length ? { appointmentDate: dateFilter } : {};
    const purchaseDateFilter = Object.keys(dateFilter).length ? { purchaseDate: dateFilter } : {};
    const expenseDateFilter = Object.keys(dateFilter).length ? { expenseDate: dateFilter } : {};

    const [sales, appointments, purchases, expenses] = await Promise.all([
      prisma.sale.aggregate({
        where: saleDateFilter,
        _sum: { totalAmount: true },
      }),
      prisma.appointment.aggregate({
        where: appointmentDateFilter,
        _sum: { totalAmount: true },
      }),
      prisma.purchase.aggregate({
        where: purchaseDateFilter,
        _sum: { totalAmount: true },
      }),
      prisma.expense.aggregate({
        where: expenseDateFilter,
        _sum: { amount: true },
      }),
    ]);

    const pharmacyRevenue = sales._sum.totalAmount ?? 0;
    const appointmentRevenue = appointments._sum.totalAmount ?? 0;
    const totalRevenue = pharmacyRevenue + appointmentRevenue;

    const purchaseCost = purchases._sum.totalAmount ?? 0;
    const operatingExpenses = expenses._sum.amount ?? 0;
    const totalExpenses = purchaseCost + operatingExpenses;

    const netIncome = totalRevenue - totalExpenses;

    return NextResponse.json({
      incomeStatement: {
        revenue: {
          pharmacy: pharmacyRevenue,
          appointments: appointmentRevenue,
          total: totalRevenue,
        },
        expenses: {
          purchases: purchaseCost,
          operating: operatingExpenses,
          total: totalExpenses,
        },
        netIncome,
      },
      dateRange: { from: from ?? null, to: to ?? null },
    });
  } catch (e) {
    console.error("Financial reports error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
