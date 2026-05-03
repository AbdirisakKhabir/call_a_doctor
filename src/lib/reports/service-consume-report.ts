import type { PrismaClient } from "@prisma/client";

const DISPOSABLE_PURPOSE = "service_disposable";

export type ServiceConsumeReport = {
  range: { from: string; to: string };
  branchId: number | null;
  completedAppointmentCount: number;
  totalServiceQuantity: number;
  services: {
    serviceId: number;
    serviceName: string;
    quantityProvided: number;
    revenue: number;
  }[];
  disposables: {
    productId: number;
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    costTotal: number;
    sellingValue: number;
  }[];
  totals: {
    serviceRevenue: number;
    disposablesCost: number;
    disposablesSellingValue: number;
  };
};

type BranchScope = { branchId: number } | { branchId: { in: number[] } } | Record<string, never>;

/**
 * Completed calendar bookings in range: services delivered + pharmacy stock consumed as service disposables.
 */
export async function buildServiceConsumeReport(
  prisma: PrismaClient,
  args: {
    from: string;
    to: string;
    dateFilter: { gte: Date; lte: Date };
    branchId: number | null;
    branchScope: BranchScope;
  }
): Promise<ServiceConsumeReport> {
  const { dateFilter, branchScope, branchId, from, to } = args;

  const appointmentWhere = {
    status: "completed" as const,
    appointmentDate: dateFilter,
    ...branchScope,
  };

  const [completedCount, serviceLines, logs] = await Promise.all([
    prisma.appointment.count({ where: appointmentWhere }),
    prisma.appointmentService.findMany({
      where: { appointment: appointmentWhere },
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
  const totalServiceQuantity = services.reduce((s, x) => s + x.quantityProvided, 0);

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

  return {
    range: { from, to },
    branchId,
    completedAppointmentCount: completedCount,
    totalServiceQuantity,
    services,
    disposables,
    totals: {
      serviceRevenue: Math.round(totalServiceRevenue * 100) / 100,
      disposablesCost: Math.round(totalDisposablesCost * 100) / 100,
      disposablesSellingValue: Math.round(totalDisposablesSelling * 100) / 100,
    },
  };
}
