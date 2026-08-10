import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";
import { buildLabOrderListWhere } from "@/lib/lab-order-list-filters";

async function canAccessLabSales(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "financial.view")) ||
    (await userHasPermission(userId, "accounts.reports")) ||
    (await userHasPermission(userId, "lab.view"))
  );
}

function buildWhere(searchParams: URLSearchParams) {
  return buildLabOrderListWhere(searchParams);
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
