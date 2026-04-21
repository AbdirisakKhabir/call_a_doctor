import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

const DISPOSABLE_PURPOSE = "service_disposable";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const branchIdParam = searchParams.get("branchId");

    if (!from || !to) {
      return NextResponse.json({ error: "Query parameters from and to (YYYY-MM-DD) are required." }, { status: 400 });
    }

    const dateFilter: { gte: Date; lte: Date } = {
      gte: new Date(from),
      lte: (() => {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        return end;
      })(),
    };

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    let branchId: number | undefined;
    if (branchIdParam && branchIdParam !== "") {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      branchId = bid;
    } else if (branchFilter && branchFilter.length === 1) {
      branchId = branchFilter[0];
    }

    const branchScope =
      branchId != null
        ? { branchId }
        : branchFilter && branchFilter.length > 0
          ? { branchId: { in: branchFilter } }
          : {};

    const appointmentWhere = {
      status: "completed" as const,
      appointmentDate: dateFilter,
      ...branchScope,
    };

    const [completedCount, serviceLines, logs] = await Promise.all([
      prisma.appointment.count({ where: appointmentWhere }),
      prisma.appointmentService.findMany({
        where: {
          appointment: appointmentWhere,
        },
        select: {
          serviceId: true,
          quantity: true,
          totalAmount: true,
          service: { select: { id: true, name: true } },
        },
      }),
      prisma.internalStockLog.findMany({
        where: {
          purpose: DISPOSABLE_PURPOSE,
          createdAt: dateFilter,
          ...branchScope,
        },
        include: {
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              costPrice: true,
              sellingPrice: true,
            },
          },
        },
      }),
    ]);

    const serviceMap = new Map<
      number,
      { serviceId: number; serviceName: string; quantityProvided: number; revenue: number }
    >();
    for (const line of serviceLines) {
      const cur = serviceMap.get(line.serviceId);
      const q = line.quantity ?? 0;
      const rev = line.totalAmount ?? 0;
      if (cur) {
        cur.quantityProvided += q;
        cur.revenue += rev;
      } else {
        serviceMap.set(line.serviceId, {
          serviceId: line.serviceId,
          serviceName: line.service.name,
          quantityProvided: q,
          revenue: rev,
        });
      }
    }

    const services = [...serviceMap.values()].sort((a, b) => a.serviceName.localeCompare(b.serviceName));

    const productMap = new Map<
      number,
      {
        productId: number;
        productCode: string;
        productName: string;
        unit: string;
        quantity: number;
        costTotal: number;
        sellingValue: number;
      }
    >();

    for (const log of logs) {
      const p = log.product;
      const qty = log.quantity;
      const cost = (p.costPrice ?? 0) * qty;
      const sell = (p.sellingPrice ?? 0) * qty;
      const cur = productMap.get(p.id);
      if (cur) {
        cur.quantity += qty;
        cur.costTotal += cost;
        cur.sellingValue += sell;
      } else {
        productMap.set(p.id, {
          productId: p.id,
          productCode: p.code,
          productName: p.name,
          unit: p.unit || "pcs",
          quantity: qty,
          costTotal: cost,
          sellingValue: sell,
        });
      }
    }

    const disposables = [...productMap.values()].sort((a, b) => a.productName.localeCompare(b.productName));

    const totalServiceRevenue = services.reduce((s, x) => s + x.revenue, 0);
    const totalDisposablesCost = disposables.reduce((s, x) => s + x.costTotal, 0);
    const totalDisposablesSelling = disposables.reduce((s, x) => s + x.sellingValue, 0);

    return NextResponse.json({
      range: { from, to },
      branchId: branchId ?? null,
      completedAppointmentCount: completedCount,
      services,
      disposables,
      totals: {
        serviceRevenue: Math.round(totalServiceRevenue * 100) / 100,
        disposablesCost: Math.round(totalDisposablesCost * 100) / 100,
        disposablesSellingValue: Math.round(totalDisposablesSelling * 100) / 100,
      },
    });
  } catch (e) {
    console.error("Services disposables report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
