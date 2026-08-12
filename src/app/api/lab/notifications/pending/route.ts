import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { formatClientFullName } from "@/lib/patient-name";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ count: 0, orders: [] });
    }

    const where = { status: "pending" as const };

    const [count, orders] = await Promise.all([
      prisma.labOrder.count({ where }),
      prisma.labOrder.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          patient: { select: { firstName: true, lastName: true, patientCode: true } },
          items: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    return NextResponse.json({
      count,
      orders: orders.map((o) => {
        const totalItems = o.items.length;
        const pendingItems = o.items.filter((i) => i.status !== "completed").length;
        return {
          id: o.id,
          patientName: formatClientFullName(o.patient),
          patientCode: o.patient.patientCode,
          createdAt: o.createdAt.toISOString(),
          pendingItems,
          totalItems,
        };
      }),
    });
  } catch (e) {
    console.error("Lab pending notifications error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
