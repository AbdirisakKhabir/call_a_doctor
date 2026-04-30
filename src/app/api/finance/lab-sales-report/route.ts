import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { labOrderFeeRemaining, roundMoney } from "@/lib/lab-fee-settlement";

async function canAccessLabSales(userId: number): Promise<boolean> {
  return (
    (await userHasPermission(userId, "financial.view")) ||
    (await userHasPermission(userId, "accounts.reports")) ||
    (await userHasPermission(userId, "lab.view"))
  );
}

type GroupBy = "none" | "branch" | "doctor" | "day";

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
  const status = searchParams.get("status");
  const doctorId = searchParams.get("doctorId");
  const branchId = searchParams.get("branchId");
  const createdAt = parseDateRange(searchParams);

  return {
    ...(status && status !== "all" ? { status } : {}),
    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
    ...(branchId ? { appointment: { branchId: Number(branchId) } } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canAccessLabSales(auth.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const groupByRaw = searchParams.get("groupBy") || "none";
    const groupBy: GroupBy = ["branch", "doctor", "day"].includes(groupByRaw)
      ? (groupByRaw as GroupBy)
      : "none";

    const where = buildWhere(searchParams);

    const orders = await prisma.labOrder.findMany({
      where,
      select: {
        id: true,
        totalAmount: true,
        labFeePaidAmount: true,
        labFeeDiscountAmount: true,
        status: true,
        createdAt: true,
        doctorId: true,
        doctor: { select: { id: true, name: true } },
        appointment: {
          select: {
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    type Row = {
      key: string;
      label: string;
      orderCount: number;
      totalFees: number;
      totalPaid: number;
      totalDiscount: number;
      totalOutstanding: number;
    };

    const map = new Map<string, Row>();

    function addRow(key: string, label: string) {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          orderCount: 0,
          totalFees: 0,
          totalPaid: 0,
          totalDiscount: 0,
          totalOutstanding: 0,
        });
      }
      return map.get(key)!;
    }

    let orderCount = 0;
    let totalFees = 0;
    let totalPaid = 0;
    let totalDiscount = 0;
    let totalOutstanding = 0;

    for (const o of orders) {
      orderCount += 1;
      const fee = roundMoney(o.totalAmount ?? 0);
      const paid = roundMoney(o.labFeePaidAmount ?? 0);
      const disc = roundMoney(o.labFeeDiscountAmount ?? 0);
      const out = roundMoney(labOrderFeeRemaining(o));
      totalFees += fee;
      totalPaid += paid;
      totalDiscount += disc;
      totalOutstanding += out;

      if (groupBy === "none") continue;

      let gKey: string;
      let gLabel: string;
      if (groupBy === "branch") {
        const b = o.appointment.branch;
        gKey = `b-${b?.id ?? 0}`;
        gLabel = b?.name ?? "—";
      } else if (groupBy === "doctor") {
        gKey = `d-${o.doctorId}`;
        gLabel = o.doctor.name;
      } else {
        const d = new Date(o.createdAt);
        gKey = d.toISOString().slice(0, 10);
        gLabel = gKey;
      }

      const row = addRow(gKey, gLabel);
      row.orderCount += 1;
      row.totalFees += fee;
      row.totalPaid += paid;
      row.totalDiscount += disc;
      row.totalOutstanding += out;
    }

    const breakdown =
      groupBy === "none"
        ? []
        : [...map.values()].sort((a, b) => {
            if (groupBy === "day") return b.key.localeCompare(a.key);
            return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
          });

    return NextResponse.json({
      groupBy,
      filters: {
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        branchId: searchParams.get("branchId"),
        doctorId: searchParams.get("doctorId"),
        status: searchParams.get("status"),
      },
      summary: {
        orderCount,
        totalFees: roundMoney(totalFees),
        totalPaid: roundMoney(totalPaid),
        totalDiscount: roundMoney(totalDiscount),
        totalOutstanding: roundMoney(totalOutstanding),
      },
      breakdown: breakdown.map((r) => ({
        ...r,
        totalFees: roundMoney(r.totalFees),
        totalPaid: roundMoney(r.totalPaid),
        totalDiscount: roundMoney(r.totalDiscount),
        totalOutstanding: roundMoney(r.totalOutstanding),
      })),
    });
  } catch (e) {
    console.error("Finance lab sales report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
