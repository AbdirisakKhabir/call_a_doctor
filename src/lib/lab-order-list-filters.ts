import type { Prisma } from "@prisma/client";

/** Shared list filters for lab order endpoints (orders page, finance lab sales). */
export function parseLabOrderCreatedAtRange(searchParams: URLSearchParams): {
  gte?: Date;
  lte?: Date;
} {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    const [y, mo, d] = from.split("-").map(Number);
    createdAt.gte = new Date(y, mo - 1, d, 0, 0, 0, 0);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const [y, mo, d] = to.split("-").map(Number);
    createdAt.lte = new Date(y, mo - 1, d, 23, 59, 59, 999);
  }
  return createdAt;
}

export function buildLabOrderListWhere(searchParams: URLSearchParams): Prisma.LabOrderWhereInput {
  const patientId = searchParams.get("patientId");
  const appointmentId = searchParams.get("appointmentId");
  const status = searchParams.get("status");
  const doctorId = searchParams.get("doctorId");
  const branchId = searchParams.get("branchId");
  const search = searchParams.get("search")?.trim() ?? "";
  const createdAt = parseLabOrderCreatedAtRange(searchParams);

  const where: Prisma.LabOrderWhereInput = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(appointmentId ? { appointmentId: Number(appointmentId) } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
    ...(branchId ? { appointment: { branchId: Number(branchId) } } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };

  if (search.length >= 1) {
    const patientOr = [
      { patientCode: { contains: search } },
      { firstName: { contains: search } },
      { lastName: { contains: search } },
    ];
    const orderId = Number(search.replace(/^#/, ""));
    if (Number.isInteger(orderId) && orderId > 0) {
      where.OR = [{ id: orderId }, { patient: { OR: patientOr } }, { doctor: { name: { contains: search } } }];
    } else {
      where.OR = [{ patient: { OR: patientOr } }, { doctor: { name: { contains: search } } }];
    }
  }

  return where;
}
