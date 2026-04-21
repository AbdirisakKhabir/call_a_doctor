import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import {
  canListVisitCards,
  getUserBranchIdFilter,
  getVisitCardAccess,
} from "@/lib/visit-card-access";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { getFinanceAccountBalance } from "@/lib/finance-balance";
import { serializePatient } from "@/lib/patient-name";
import { resolveReferralSourceIdForWrite } from "@/lib/referral-source";
import { calculateAgeFromDate } from "@/lib/age-from-dob";
import { assertActiveBranch, assertVillageInCity } from "@/lib/patient-location";
import { assertOpenCareFileForPatient, ensureOpenCareFile } from "@/lib/care-file";

const visitInclude = {
  branch: { select: { id: true, name: true } },
  patient: {
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
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
  depositTransaction: { select: { id: true, amount: true, transactionDate: true, accountId: true } },
  careFile: { select: { id: true, fileCode: true, status: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    if (!canListVisitCards(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    const where: Prisma.DoctorVisitCardWhereInput = {};

    if (branchFilter) {
      where.branchId = { in: branchFilter };
    }
    if (branchId && Number.isInteger(Number(branchId))) {
      const bid = Number(branchId);
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
      where.branchId = bid;
    }

    if (access.viewOwn && !access.viewAll && access.doctorId != null) {
      where.doctorId = access.doctorId;
    }

    if (paginate) {
      const [data, total] = await Promise.all([
        prisma.doctorVisitCard.findMany({
          where,
          include: visitInclude,
          orderBy: [{ visitDate: "desc" }, { id: "desc" }],
          skip,
          take: pageSize,
        }),
        prisma.doctorVisitCard.count({ where }),
      ]);
      return NextResponse.json({
        data: data.map((row) => ({ ...row, patient: serializePatient(row.patient) })),
        total,
        page,
        pageSize,
      });
    }

    const data = await prisma.doctorVisitCard.findMany({
      where,
      include: visitInclude,
      orderBy: [{ visitDate: "desc" }, { id: "desc" }],
      take: 500,
    });
    return NextResponse.json(data.map((row) => ({ ...row, patient: serializePatient(row.patient) })));
  } catch (e) {
    console.error("Visit cards list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await getVisitCardAccess(auth.userId);
    if (!access.canCreate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      branchId: bid,
      doctorId: did,
      cardNumber,
      visitDate,
      patientId: pid,
      newPatient,
      visitFee,
      paymentStatus,
      notes,
      paymentMethodId: bodyPaymentMethodId,
      transactionDate,
      careFileId: bodyCareFileId,
    } = body;

    const branchId = Number(bid);
    const doctorId = Number(did);
    if (!Number.isInteger(branchId) || !Number.isInteger(doctorId)) {
      return NextResponse.json({ error: "Branch and doctor are required" }, { status: 400 });
    }
    if (!cardNumber || typeof cardNumber !== "string" || !String(cardNumber).trim()) {
      return NextResponse.json({ error: "Visit card number is required" }, { status: 400 });
    }
    if (!visitDate) {
      return NextResponse.json({ error: "Visit date is required" }, { status: 400 });
    }

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    if (branchFilter && !branchFilter.includes(branchId)) {
      return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
    }

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, isActive: true },
    });
    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    let patientId: number;
    if (pid != null && Number.isInteger(Number(pid))) {
      patientId = Number(pid);
      const p = await prisma.patient.findFirst({ where: { id: patientId, isActive: true } });
      if (!p) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    } else if (
      newPatient &&
      typeof newPatient.firstName === "string" &&
      typeof newPatient.lastName === "string" &&
      newPatient.firstName.trim() &&
      newPatient.lastName.trim()
    ) {
      const count = await prisma.patient.count();
      const patientCode = `PAT-${String(count + 1).padStart(4, "0")}`;
      const refNew = await resolveReferralSourceIdForWrite(
        newPatient && typeof newPatient === "object"
          ? (newPatient as Record<string, unknown>).referralSourceId
          : undefined
      );
      if (!refNew.ok) {
        return NextResponse.json({ error: refNew.error }, { status: 400 });
      }
      const np = newPatient as Record<string, unknown>;
      const rb = Number(np.registeredBranchId);
      if (!Number.isInteger(rb)) {
        return NextResponse.json({ error: "Registration branch is required for a new client" }, { status: 400 });
      }
      if (!(await assertActiveBranch(rb))) {
        return NextResponse.json({ error: "Invalid or inactive registration branch" }, { status: 400 });
      }
      const cId = Number(np.cityId);
      const vId = Number(np.villageId);
      if (!Number.isInteger(cId) || !Number.isInteger(vId)) {
        return NextResponse.json({ error: "City and village are required for a new client" }, { status: 400 });
      }
      if (!(await assertVillageInCity(vId, cId))) {
        return NextResponse.json({ error: "Invalid or inactive city/village combination" }, { status: 400 });
      }

      const dob = newPatient.dateOfBirth ? new Date(newPatient.dateOfBirth) : null;
      const created = await prisma.patient.create({
        data: {
          patientCode,
          firstName: String(newPatient.firstName).trim(),
          lastName: String(newPatient.lastName).trim(),
          phone: newPatient.phone ? String(newPatient.phone).trim() : null,
          email: newPatient.email ? String(newPatient.email).trim() : null,
          dateOfBirth: dob,
          age: calculateAgeFromDate(dob),
          gender: newPatient.gender ? String(newPatient.gender).trim() : null,
          address: newPatient.address ? String(newPatient.address).trim() : null,
          cityId: cId,
          villageId: vId,
          registeredBranchId: rb,
          ...(refNew.value != null ? { referralSourceId: refNew.value } : {}),
        },
      });
      patientId = created.id;
    } else {
      return NextResponse.json(
        { error: "Provide an existing client id or new client first and last name" },
        { status: 400 }
      );
    }

    const pay =
      typeof paymentStatus === "string" && ["paid", "unpaid", "appointment", "free"].includes(paymentStatus)
        ? paymentStatus
        : "unpaid";

    const fee = visitFee != null && visitFee !== "" ? Number(visitFee) : 0;
    if (Number.isNaN(fee) || fee < 0) {
      return NextResponse.json({ error: "Invalid visit fee" }, { status: 400 });
    }

    let pmid: number | null = null;
    if (bodyPaymentMethodId != null && bodyPaymentMethodId !== "") {
      const n = Number(bodyPaymentMethodId);
      if (!Number.isInteger(n)) {
        return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
      }
      pmid = n;
    }

    const needDeposit = pay === "paid" && fee > 0 && pmid != null;
    if (pay === "paid" && fee > 0 && !pmid) {
      return NextResponse.json(
        { error: "Payment method is required when creating a paid visit with a fee" },
        { status: 400 }
      );
    }
    if (needDeposit && !(await userHasPermission(auth.userId, "accounts.deposit"))) {
      return NextResponse.json(
        { error: "Recording a paid visit requires accounts.deposit permission" },
        { status: 403 }
      );
    }

    let card;
    try {
      card = await prisma.$transaction(async (tx) => {
        let careFileId: number | null = null;
        if (bodyCareFileId != null && bodyCareFileId !== "") {
          const cf = await assertOpenCareFileForPatient(tx, patientId, Number(bodyCareFileId));
          careFileId = cf.id;
        } else {
          const ensured = await ensureOpenCareFile(tx, patientId);
          careFileId = ensured.id;
        }

        const created = await tx.doctorVisitCard.create({
          data: {
            cardNumber: String(cardNumber).trim(),
            branchId,
            patientId,
            doctorId,
            visitDate: new Date(visitDate),
            status: "inWaiting",
            paymentStatus: pay,
            visitFee: fee,
            paymentMethodId: pmid,
            notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
            createdById: auth.userId,
            careFileId,
          },
        });

        if (needDeposit) {
          const pm = await tx.ledgerPaymentMethod.findFirst({
            where: { id: pmid!, isActive: true },
            include: { account: true },
          });
          if (!pm || !pm.account.isActive) {
            throw new Error("INVALID_PM");
          }
          await tx.accountTransaction.create({
            data: {
              accountId: pm.accountId,
              kind: "deposit",
              amount: fee,
              description: `Doctor visit card ${created.cardNumber} (#${created.id})`,
              paymentMethodId: pmid!,
              doctorVisitCardId: created.id,
              transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
              createdById: auth.userId,
            },
          });
        }

        return tx.doctorVisitCard.findUnique({
          where: { id: created.id },
          include: visitInclude,
        });
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
        return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
      }
      if (e instanceof Error && e.message === "INVALID_PM") {
        return NextResponse.json({ error: "Invalid or inactive payment method" }, { status: 400 });
      }
      throw e;
    }

    if (card) {
      await logAuditFromRequest(req, {
        userId: auth.userId,
        action: "visit_card.create",
        module: "visit_cards",
        resourceType: "DoctorVisitCard",
        resourceId: card.id,
        metadata: { cardNumber: card.cardNumber, branchId: card.branchId },
      });
    }

    let accountBalanceAfter: number | undefined;
    if (card?.depositTransaction?.accountId != null) {
      accountBalanceAfter = await getFinanceAccountBalance(card.depositTransaction.accountId);
    }
    const cardOut = card
      ? { ...card, patient: serializePatient(card.patient) }
      : card;
    return NextResponse.json(
      accountBalanceAfter != null ? { ...cardOut, accountBalanceAfter } : cardOut
    );
  } catch (e: unknown) {
    console.error("Visit card create error:", e);
    const msg = e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002";
    if (msg) {
      return NextResponse.json(
        { error: "This visit card number is already used for this branch" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
