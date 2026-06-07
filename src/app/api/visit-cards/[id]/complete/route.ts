import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canSeeVisitCardRow,
  getUserBranchIdFilter,
  getVisitCardAccess,
} from "@/lib/visit-card-access";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";

const visitInclude = {
  branch: { select: { id: true, name: true } },
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      mobile: true,
      address: true,
      cityId: true,
      villageId: true,
      registeredBranchId: true,
      city: { select: { id: true, name: true } },
      village: { select: { id: true, name: true } },
      registeredBranch: { select: { id: true, name: true } },
      referralSource: { select: { id: true, name: true } },
    },
  },
  doctor: { select: { id: true, name: true } },
  paymentMethod: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  depositTransaction: {
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      accountId: true,
      account: { select: { id: true, name: true } },
    },
  },
} as const;

function canMarkVisitCompleted(
  access: Awaited<ReturnType<typeof getVisitCardAccess>>,
  rowDoctorId: number
): boolean {
  if (access.canEdit) return true;
  if (access.viewOwn && access.doctorId != null && access.doctorId === rowDoctorId) return true;
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    const { id } = await params;
    const cardId = Number(id);
    if (!Number.isInteger(cardId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.doctorVisitCard.findUnique({
      where: { id: cardId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!canSeeVisitCardRow(access, existing.doctorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    if (branchFilter && !branchFilter.includes(existing.branchId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!canMarkVisitCompleted(access, existing.doctorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (existing.status === "cancelled") {
      return NextResponse.json({ error: "This visit card is cancelled and cannot be completed." }, { status: 400 });
    }

    if (existing.status === "completed") {
      const already = await prisma.doctorVisitCard.findUnique({
        where: { id: cardId },
        include: visitInclude,
      });
      return NextResponse.json(
        already ? { ...already, patient: serializePatient(already.patient) } : already
      );
    }

    await prisma.doctorVisitCard.update({
      where: { id: cardId },
      data: { status: "completed" },
    });

    const fresh = await prisma.doctorVisitCard.findUnique({
      where: { id: cardId },
      include: visitInclude,
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "visit_card.complete",
      module: "visit_cards",
      resourceType: "DoctorVisitCard",
      resourceId: cardId,
      metadata: { previousStatus: existing.status },
    });

    return NextResponse.json(
      fresh ? { ...fresh, patient: serializePatient(fresh.patient) } : fresh
    );
  } catch (e) {
    console.error("Visit card complete error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
