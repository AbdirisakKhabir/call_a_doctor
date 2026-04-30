import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";

async function canAccessLabSales(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "financial.view")) ||
    (await userHasPermission(userId, "accounts.reports")) ||
    (await userHasPermission(userId, "lab.view"))
  );
}

function parseDateRange(searchParams: URLSearchParams): { gte?: Date; lte?: Date } {
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

function buildWhere(searchParams: URLSearchParams): Prisma.LabOrderWhereInput {
  const patientId = searchParams.get("patientId");
  const status = searchParams.get("status");
  const doctorId = searchParams.get("doctorId");
  const branchId = searchParams.get("branchId");
  const search = searchParams.get("search")?.trim() ?? "";
  const createdAt = parseDateRange(searchParams);

  const where: Prisma.LabOrderWhereInput = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
    ...(branchId ? { appointment: { branchId: Number(branchId) } } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };

  if (search.length >= 1) {
    where.patient = {
      OR: [
        { patientCode: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ],
    };
  }

  return where;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canAccessLabSales(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const where = buildWhere(searchParams);

    const include = {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
      orderedBy: { select: { id: true, name: true } },
      appointment: {
        select: {
          id: true,
          appointmentDate: true,
          startTime: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
        },
      },
      items: { select: { id: true, unitPrice: true, labTest: { select: { id: true, name: true } } } },
    };

    if (paginate) {
      const [orders, total] = await Promise.all([
        prisma.labOrder.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.labOrder.count({ where }),
      ]);
      return NextResponse.json({
        data: orders.map((o) => ({
          ...o,
          patient: serializePatient(o.patient),
          feeOutstanding: roundMoney(labOrderFeeRemaining(o)),
        })),
        total,
        page,
        pageSize,
      });
    }

    const orders = await prisma.labOrder.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json(
      orders.map((o) => ({
        ...o,
        patient: serializePatient(o.patient),
        feeOutstanding: roundMoney(labOrderFeeRemaining(o)),
      }))
    );
  } catch (e) {
    console.error("Finance lab sales list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
