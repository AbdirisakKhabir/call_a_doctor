import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { serializePatient } from "@/lib/patient-name";
import {
  assertOpenCareFileForPatient,
  closeOpenCareFilesAndCreateNew,
  ensureOpenCareFile,
} from "@/lib/care-file";
import { createAppointmentBillingSaleInTx } from "@/lib/appointment-billing-sale";
import { getAppointmentBlockMessage } from "@/lib/appointment-schedule-blocks";

const ALLOWED_APPOINTMENT_STATUS_FILTERS = ["scheduled", "completed", "cancelled", "no-show"] as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const statusFilter = searchParams.get("status");
    const searchRaw = (searchParams.get("search") ?? "").trim().slice(0, 120);

    const clauses: Prisma.AppointmentWhereInput[] = [];

    if (branchId) {
      const bid = Number(branchId);
      if (Number.isInteger(bid) && bid > 0) clauses.push({ branchId: bid });
    }
    if (statusFilter && ALLOWED_APPOINTMENT_STATUS_FILTERS.includes(statusFilter as (typeof ALLOWED_APPOINTMENT_STATUS_FILTERS)[number])) {
      clauses.push({ status: statusFilter });
    }
    if (startDate && endDate) {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
        ? (() => {
            const [y, mo, d] = startDate.split("-").map(Number);
            return new Date(y, mo - 1, d, 0, 0, 0, 0);
          })()
        : new Date(startDate);
      const end = /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? (() => {
            const [y, mo, d] = endDate.split("-").map(Number);
            return new Date(y, mo - 1, d, 23, 59, 59, 999);
          })()
        : new Date(endDate);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        clauses.push({ appointmentDate: { gte: start, lte: end } });
      }
    }

    if (searchRaw) {
      const or: Prisma.AppointmentWhereInput[] = [
        { patient: { firstName: { contains: searchRaw } } },
        { patient: { lastName: { contains: searchRaw } } },
        { patient: { patientCode: { contains: searchRaw } } },
        { doctor: { name: { contains: searchRaw } } },
        { branch: { name: { contains: searchRaw } } },
        { services: { some: { service: { name: { contains: searchRaw } } } } },
      ];
      if (/^\d+$/.test(searchRaw)) {
        const idNum = Number.parseInt(searchRaw, 10);
        if (Number.isFinite(idNum) && idNum > 0) or.push({ id: idNum });
      }
      clauses.push({ OR: or });
    }

    const where: Prisma.AppointmentWhereInput =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses };

    const orderBy =
      statusFilter === "cancelled"
        ? [{ appointmentDate: "desc" as const }, { startTime: "desc" as const }]
        : [{ appointmentDate: "asc" as const }, { startTime: "asc" as const }];

    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const paginateRequested = pageParam != null || pageSizeParam != null;

    let page = 1;
    let pageSize = 20;
    if (pageParam != null) {
      const p = Number(pageParam);
      if (Number.isInteger(p) && p >= 1) page = p;
    }
    if (pageSizeParam != null) {
      const ps = Number(pageSizeParam);
      if (Number.isInteger(ps) && ps >= 1) pageSize = Math.min(ps, 100);
    }

    const include = {
      branch: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true, specialty: true } },
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      services: {
        include: { service: { select: { id: true, name: true, color: true } } },
      },
    };

    if (paginateRequested) {
      const [total, appointments] = await prisma.$transaction([
        prisma.appointment.count({ where }),
        prisma.appointment.findMany({
          where,
          include,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return NextResponse.json({
        data: appointments.map((a) => ({ ...a, patient: serializePatient(a.patient) })),
        total,
        page,
        pageSize,
      });
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include,
      orderBy,
    });
    return NextResponse.json(appointments.map((a) => ({ ...a, patient: serializePatient(a.patient) })));
  } catch (e) {
    console.error("Appointments list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const {
      branchId,
      doctorId,
      patientId,
      appointmentDate,
      startTime,
      endTime,
      notes,
      services,
      reminderMinutesBefore,
      careFileId: bodyCareFileId,
      startNewCareFile,
      paymentMethodId: bodyPaymentMethodId,
      billingDiscount: bodyBillingDiscount,
      paidAmount: bodyPaidAmount,
    } = body;

    const billingDiscount =
      typeof bodyBillingDiscount === "number" && Number.isFinite(bodyBillingDiscount)
        ? Math.max(0, bodyBillingDiscount)
        : typeof bodyBillingDiscount === "string" && bodyBillingDiscount.trim() !== ""
          ? Math.max(0, Number(bodyBillingDiscount) || 0)
          : 0;

    let paidNowExplicit: number | undefined;
    if (bodyPaidAmount !== undefined && bodyPaidAmount !== null && String(bodyPaidAmount).trim() !== "") {
      const p = Number(bodyPaidAmount);
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "Invalid paid amount" }, { status: 400 });
      }
      paidNowExplicit = p;
    }

    if (!branchId || !doctorId || !patientId || !appointmentDate || !startTime) {
      return NextResponse.json({ error: "Branch, doctor, client, date and start time are required" }, { status: 400 });
    }

    let totalAmount = 0;
    const appointmentServices: { serviceId: number; quantity: number; unitPrice: number; totalAmount: number }[] = [];

    if (Array.isArray(services) && services.length > 0) {
      for (const s of services) {
        const serviceId = Number(s.serviceId);
        const quantity = Math.max(1, Math.floor(Number(s.quantity) || 1));
        const unitPrice = Math.max(0, Number(s.unitPrice) || 0);
        const lineTotal = quantity * unitPrice;
        if (Number.isInteger(serviceId) && serviceId > 0) {
          appointmentServices.push({ serviceId, quantity, unitPrice, totalAmount: lineTotal });
          totalAmount += lineTotal;
        }
      }
    }

    const patientIdNum = Number(patientId);

    let paymentMethodId: number | null = null;
    if (bodyPaymentMethodId != null && bodyPaymentMethodId !== "") {
      const pm = Number(bodyPaymentMethodId);
      if (!Number.isInteger(pm) || pm <= 0) {
        return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
      }
      const pmRow = await prisma.ledgerPaymentMethod.findFirst({
        where: { id: pm, isActive: true, account: { isActive: true } },
      });
      if (!pmRow) {
        return NextResponse.json(
          {
            error:
              "Invalid payment method. Choose an active method linked to a finance account (Settings → Payment methods).",
          },
          { status: 400 }
        );
      }
      paymentMethodId = pm;
    }

    let reminder: number | null = null;
    if (reminderMinutesBefore != null && reminderMinutesBefore !== "") {
      const r = Number(reminderMinutesBefore);
      if (Number.isFinite(r) && r > 0 && r <= 10080) reminder = Math.floor(r);
    }

    const due = Math.max(0, totalAmount - billingDiscount);
    const paidNowForSale =
      paidNowExplicit !== undefined ? Math.min(due, Math.max(0, paidNowExplicit)) : undefined;

    if (paidNowForSale !== undefined && paidNowForSale > 0 && paymentMethodId == null) {
      return NextResponse.json(
        { error: "Choose a payment method to record a payment." },
        { status: 400 }
      );
    }

    const blockMsg = await getAppointmentBlockMessage(prisma, {
      branchId: Number(branchId),
      appointmentDate: String(appointmentDate).slice(0, 10),
      startTime: String(startTime),
      endTime: endTime ? String(endTime) : null,
    });
    if (blockMsg) {
      return NextResponse.json({ error: blockMsg }, { status: 400 });
    }

    let createdBillingSaleId: number | null = null;
    const appointment = await prisma.$transaction(async (tx) => {
      let resolvedCareFileId: number | null = null;
      if (startNewCareFile === true) {
        const nf = await closeOpenCareFilesAndCreateNew(tx, patientIdNum, null);
        resolvedCareFileId = nf.id;
      } else if (bodyCareFileId != null && bodyCareFileId !== "") {
        const cf = await assertOpenCareFileForPatient(tx, patientIdNum, Number(bodyCareFileId));
        resolvedCareFileId = cf.id;
      } else {
        const ensured = await ensureOpenCareFile(tx, patientIdNum);
        resolvedCareFileId = ensured.id;
      }

    let apt = await tx.appointment.create({
        data: {
          branchId: Number(branchId),
          doctorId: Number(doctorId),
          patientId: patientIdNum,
          appointmentDate: new Date(appointmentDate),
          startTime: String(startTime),
          endTime: endTime ? String(endTime) : null,
          notes: notes ? String(notes).trim() : null,
          reminderMinutesBefore: reminder,
          totalAmount,
          status: "scheduled",
          paymentMethodId,
          postedChargesToPatientOnCreate: true,
          createdById: auth.userId,
          careFileId: resolvedCareFileId,
          services: appointmentServices.length
            ? { create: appointmentServices }
            : undefined,
        },
        include: {
          branch: { select: { id: true, name: true } },
          doctor: { select: { id: true, name: true } },
          patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, accountBalance: true } },
          careFile: { select: { id: true, fileCode: true, status: true } },
          services: { include: { service: { select: { id: true, name: true, color: true } } } },
        },
      });

      let billingSalePostedAtCreate = false;
      if (due > 0 && paymentMethodId && appointmentServices.length > 0) {
        const bill = await createAppointmentBillingSaleInTx(tx, {
          appointmentId: apt.id,
          branchId: Number(branchId),
          patientId: patientIdNum,
          userId: auth.userId,
          paymentMethodId,
          discount: billingDiscount,
          ...(paidNowForSale !== undefined ? { paidNow: paidNowForSale } : {}),
          lines: appointmentServices,
        });
        if (bill.created) {
          billingSalePostedAtCreate = true;
          createdBillingSaleId = bill.saleId;
          await tx.appointment.update({
            where: { id: apt.id },
            data: { postedChargesToPatientOnCreate: false },
          });
          apt = { ...apt, postedChargesToPatientOnCreate: false };
        }
      }

      if (due > 0 && !billingSalePostedAtCreate) {
        await tx.patient.update({
          where: { id: patientIdNum },
          data: { accountBalance: { increment: due } },
        });
      }
      return apt;
    });
    if (!appointment) {
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "appointment.create",
      module: "appointments",
      resourceType: "Appointment",
      resourceId: appointment.id,
      metadata: {
        branchId: appointment.branchId,
        patientId: appointment.patientId,
        totalAmount,
        patientCharged: totalAmount > 0,
        visitBillingSaleAtCreate: !appointment.postedChargesToPatientOnCreate && totalAmount > 0,
      },
    });
    return NextResponse.json({
      ...appointment,
      patient: serializePatient(appointment.patient),
      createdBillingSaleId,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_PAYMENT_METHOD") {
      return NextResponse.json(
        {
          error:
            "Invalid payment method. Choose an active method linked to a finance account (Settings → Payment methods).",
        },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    console.error("Create appointment error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
