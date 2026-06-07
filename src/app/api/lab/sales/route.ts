import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "pharmacy.pos")) && !(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchId = Number(searchParams.get("branchId"));
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = { branchId };

    if (paginate) {
      const [data, total] = await Promise.all([
        prisma.labSale.findMany({
          where,
          orderBy: { saleDate: "desc" },
          skip,
          take: pageSize,
          include: {
            patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
            createdBy: { select: { id: true, name: true } },
            items: {
              include: {
                labInventoryItem: { select: { id: true, name: true, code: true, unit: true } },
              },
            },
          },
        }),
        prisma.labSale.count({ where }),
      ]);
      return NextResponse.json({ data, total, page, pageSize });
    }

    const rows = await prisma.labSale.findMany({
      where,
      orderBy: { saleDate: "desc" },
      take: 200,
      include: {
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            labInventoryItem: { select: { id: true, name: true, code: true, unit: true } },
          },
        },
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Lab sales GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** Lab stock is issued via pharmacy POS (Customer: Lab), not a separate lab register. */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "Lab does not use a separate sales register. Use Point of Sale → select Customer: Lab to move pharmacy stock into lab inventory; test results then deduct via disposables.",
    },
    { status: 410 }
  );
}
