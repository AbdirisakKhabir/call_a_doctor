import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canList =
      (await userHasPermission(auth.userId, "accounts.deposit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos")) ||
      (await userHasPermission(auth.userId, "accounts.view"));
    if (!canList) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const patientIdParam = searchParams.get("patientId");
    const patientId = patientIdParam ? Number(patientIdParam) : NaN;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (from) createdAtFilter.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      createdAtFilter.lte = end;
    }
    const hasDateFilter = Object.keys(createdAtFilter).length > 0;

    const where: Prisma.PatientPaymentWhereInput = {
      ...(hasDateFilter ? { createdAt: createdAtFilter } : {}),
    };

    if (Number.isInteger(patientId) && patientId > 0) {
      where.patientId = patientId;
    } else if (q) {
      where.patient = {
        OR: [
          { patientCode: { contains: q } },
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { phone: { contains: q } },
          { mobile: { contains: q } },
        ],
      };
    }

    const include = {
      patient: {
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
        },
      },
      paymentMethod: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true } },
      labOrder: { select: { id: true } },
    } as const;

    if (paginate) {
      const [rows, total] = await Promise.all([
        prisma.patientPayment.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.patientPayment.count({ where }),
      ]);
      return NextResponse.json({
        data: rows.map((r) => ({
          ...r,
          patient: serializePatient(r.patient),
        })),
        total,
        page,
        pageSize,
      });
    }

    const rows = await prisma.patientPayment.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json(rows.map((r) => ({ ...r, patient: serializePatient(r.patient) })));
  } catch (e) {
    console.error("Patient payments list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
