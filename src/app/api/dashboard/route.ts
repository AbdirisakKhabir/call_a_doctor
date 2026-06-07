import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAllowedBranchIds } from "@/lib/branch-access";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowedBranches = await getUserAllowedBranchIds(auth.userId);
    const productBranchFilter =
      allowedBranches === null ? {} : { branchId: { in: allowedBranches } };

    const currentYear = new Date().getFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const [
      usersCount,
      rolesCount,
      permissionsCount,
      patientsCount,
      productsCount,
      lowStockCount,
      salesThisYear,
      appointmentsThisYear,
      appointmentsByStatus,
      appointmentRevenueThisYear,
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.role.count(),
      prisma.permission.count(),
      prisma.patient.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: true, ...productBranchFilter } }),
      prisma.product.count({
        where: { quantity: { lte: 10 }, isActive: true, ...productBranchFilter },
      }),
      prisma.sale.findMany({
        where: {
          saleDate: {
            gte: new Date(`${currentYear}-01-01`),
            lte: new Date(`${currentYear}-12-31T23:59:59.999Z`),
          },
        },
        select: { totalAmount: true, saleDate: true },
      }),
      prisma.appointment.findMany({
        where: {
          appointmentDate: {
            gte: new Date(`${currentYear}-01-01`),
            lte: new Date(`${currentYear}-12-31T23:59:59.999Z`),
          },
        },
        select: { appointmentDate: true, status: true, totalAmount: true },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.appointment.findMany({
        where: {
          appointmentDate: {
            gte: new Date(`${currentYear}-01-01`),
            lte: new Date(`${currentYear}-12-31T23:59:59.999Z`),
          },
        },
        select: { totalAmount: true, appointmentDate: true },
      }),
    ]);

    // Pharmacy sales by month
    const pharmacyRevenueByMonth = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const total = salesThisYear
        .filter((s) => new Date(s.saleDate).getMonth() + 1 === month)
        .reduce((sum, s) => sum + s.totalAmount, 0);
      return { month: monthNames[i], total };
    });

    // Appointments by month
    const appointmentsByMonth = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const count = appointmentsThisYear.filter(
        (a) => new Date(a.appointmentDate).getMonth() + 1 === month
      ).length;
      return { month: monthNames[i], count };
    });

    // Appointment revenue by month
    const appointmentRevenueByMonth = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const total = appointmentRevenueThisYear
        .filter((a) => new Date(a.appointmentDate).getMonth() + 1 === month)
        .reduce((sum, a) => sum + a.totalAmount, 0);
      return { month: monthNames[i], total };
    });

    const totalPharmacyRevenue = salesThisYear.reduce((s, x) => s + x.totalAmount, 0);
    const totalAppointmentRevenue = appointmentRevenueThisYear.reduce((s, x) => s + x.totalAmount, 0);
    const totalRevenue = totalPharmacyRevenue + totalAppointmentRevenue;

    const totalAppointments = appointmentsByStatus.reduce((s, x) => s + x._count.id, 0);
    const completedAppointments = appointmentsByStatus.find((x) => x.status === "completed")?._count.id ?? 0;
    const scheduledAppointments = appointmentsByStatus.find((x) => x.status === "scheduled")?._count.id ?? 0;
    const completionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;

    const lowStockPercent = productsCount > 0 ? Math.round((lowStockCount / productsCount) * 100) : 0;

    return NextResponse.json({
      counts: {
        users: usersCount,
        roles: rolesCount,
        permissions: permissionsCount,
        patients: patientsCount,
        products: productsCount,
        lowStock: lowStockCount,
        totalAppointments,
        completedAppointments,
        scheduledAppointments,
      },
      revenue: {
        total: totalRevenue,
        pharmacy: totalPharmacyRevenue,
        appointments: totalAppointmentRevenue,
      },
      percentages: {
        appointmentCompletionRate: completionRate,
        lowStockPercent,
      },
      charts: {
        pharmacyRevenueByMonth,
        appointmentsByMonth,
        appointmentRevenueByMonth,
        appointmentsByStatus: appointmentsByStatus.map((x) => ({
          status: x.status,
          count: x._count.id,
        })),
      },
    });
  } catch (e) {
    console.error("Dashboard stats error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
