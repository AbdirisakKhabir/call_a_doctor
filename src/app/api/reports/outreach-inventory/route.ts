import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";
import {
  getPharmacyReportListBranchScope,
  userCanTransactInventoryAtBranch,
} from "@/lib/branch-access";

/** Outreach movement for a date range: issuance (POS), returns, emergency medication, bag inventory snapshot. */
function parseYmdLocal(ymd: string, endOfDay: boolean): Date | null {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  if (endOfDay) dt.setHours(23, 59, 59, 999);
  else dt.setHours(0, 0, 0, 0);
  return dt;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const branchIdParam = searchParams.get("branchId");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    /** @deprecated use from + to */
    const monthParam = searchParams.get("month");
    const teamIdParam = searchParams.get("teamId");

    let start: Date;
    let end: Date;
    let dateFromStr: string;
    let dateToStr: string;

    if (fromParam && toParam) {
      const s = parseYmdLocal(fromParam, false);
      const e = parseYmdLocal(toParam, true);
      if (!s || !e) {
        return NextResponse.json({ error: "from and to must be valid dates (YYYY-MM-DD)" }, { status: 400 });
      }
      if (s.getTime() > e.getTime()) {
        return NextResponse.json({ error: "Start date must be on or before end date" }, { status: 400 });
      }
      start = s;
      end = e;
      dateFromStr = fromParam.slice(0, 10);
      dateToStr = toParam.slice(0, 10);
    } else if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number);
      if (!y || !m || m < 1 || m > 12) {
        return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
      }
      start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      end = new Date(y, m, 0, 23, 59, 59, 999);
      const pad = (n: number) => String(n).padStart(2, "0");
      dateFromStr = `${y}-${pad(m)}-01`;
      dateToStr = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
    } else {
      return NextResponse.json(
        { error: "branchId and reporting period are required: from and to (YYYY-MM-DD), or month (YYYY-MM)" },
        { status: 400 }
      );
    }

    if (!branchIdParam) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }

    const bid = Number(branchIdParam);
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
    }

    const listScope = await getPharmacyReportListBranchScope(auth.userId);
    if (listScope !== "all" && !listScope.includes(bid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const teamFilter =
      teamIdParam && Number.isInteger(Number(teamIdParam)) ? Number(teamIdParam) : null;

    const includeRaw = searchParams.get("include") ?? "sales,returns,dispenses,snapshot";
    const validSections = new Set(["sales", "returns", "dispenses", "snapshot"]);
    const includeParts = includeRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => validSections.has(s));
    const effectiveInclude = includeParts.length
      ? includeParts
      : (["sales", "returns", "dispenses", "snapshot"] as const);
    const wantSales = effectiveInclude.includes("sales");
    const wantReturns = effectiveInclude.includes("returns");
    const wantDispenses = effectiveInclude.includes("dispenses");
    const wantSnapshot = effectiveInclude.includes("snapshot");

    const teamWhere = {
      branchId: bid,
      ...(teamFilter ? { id: teamFilter } : {}),
    };

    const branch = await prisma.branch.findFirst({
      where: { id: bid },
      select: { id: true, name: true, address: true, phone: true },
    });

    const sales = wantSales
      ? await prisma.sale.findMany({
      where: {
        branchId: bid,
        saleDate: { gte: start, lte: end },
        ...(teamFilter
          ? { outreachTeamId: teamFilter }
          : { outreachTeamId: { not: null } }),
      },
      include: {
        outreachTeam: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { saleDate: "asc" },
    })
      : [];

    const returns = wantReturns
      ? await prisma.outreachReturn.findMany({
      where: {
        branchId: bid,
        ...(teamFilter ? { teamId: teamFilter } : {}),
        returnDate: { gte: start, lte: end },
      },
      include: {
        team: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { returnDate: "asc" },
    })
      : [];

    const dispenses = wantDispenses
      ? await prisma.outreachDispense.findMany({
      where: {
        branchId: bid,
        ...(teamFilter ? { teamId: teamFilter } : {}),
        createdAt: { gte: start, lte: end },
      },
      include: {
        team: { select: { id: true, name: true } },
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })
      : [];

    const teams = wantSnapshot
      ? await prisma.outreachTeam.findMany({
      where: teamWhere,
      include: {
        inventory: {
          include: {
            product: { select: { id: true, name: true, code: true, sellingPrice: true, unit: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    })
      : [];

    return NextResponse.json({
      dateFrom: dateFromStr,
      dateTo: dateToStr,
      ...(monthParam ? { month: monthParam } : {}),
      branchId: bid,
      branch: branch
        ? { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone }
        : null,
      include: effectiveInclude,
      salesFromPharmacy: sales,
      returnsToPharmacy: returns,
      dispensesToPatients: dispenses.map((d) => ({
        ...d,
        patient: serializePatient(d.patient),
      })),
      teamInventorySnapshot: teams.map((t) => ({
        id: t.id,
        name: t.name,
        creditBalance: t.creditBalance,
        isActive: t.isActive,
        inventory: t.inventory.map((i) => ({
          productId: i.productId,
          product: i.product,
          quantity: i.quantity,
        })),
      })),
    });
  } catch (e) {
    console.error("Outreach inventory report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
