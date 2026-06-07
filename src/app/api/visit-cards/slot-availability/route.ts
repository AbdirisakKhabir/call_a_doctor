import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canListVisitCards, getUserBranchIdFilter, getVisitCardAccess } from "@/lib/visit-card-access";
import {
  VISIT_CARD_DAILY_SLOT_COUNT,
  parseVisitCardSlotNumber,
} from "@/lib/visit-card-slots";

function dayBoundsFromIsoDate(isoDate: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, mo, d] = isoDate.split("-").map(Number);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    if (!canListVisitCards(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const branchIdRaw = searchParams.get("branchId");
    const visitDate = searchParams.get("visitDate")?.trim() ?? "";
    const bid = Number(branchIdRaw);
    if (!Number.isInteger(bid) || bid < 1) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    const bounds = dayBoundsFromIsoDate(visitDate);
    if (!bounds) {
      return NextResponse.json({ error: "visitDate must be YYYY-MM-DD" }, { status: 400 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    if (branchFilter && !branchFilter.includes(bid)) {
      return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
    }

    const rows = await prisma.doctorVisitCard.findMany({
      where: {
        branchId: bid,
        visitDate: { gte: bounds.start, lte: bounds.end },
        status: { not: "cancelled" },
      },
      select: { cardNumber: true },
    });

    const taken = new Set<number>();
    for (const r of rows) {
      const slot = parseVisitCardSlotNumber(r.cardNumber);
      if (slot != null) taken.add(slot);
    }

    return NextResponse.json({
      maxSlots: VISIT_CARD_DAILY_SLOT_COUNT,
      takenSlots: [...taken].sort((a, b) => a - b),
    });
  } catch (e) {
    console.error("Visit card slot availability error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
