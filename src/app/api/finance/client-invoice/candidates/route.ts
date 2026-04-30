import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";

function appointmentDateFilter(from: string | null, to: string | null): { gte?: Date; lte?: Date } | undefined {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }
  return Object.keys(dateFilter).length > 0 ? dateFilter : undefined;
}

/**
 * Lists billable candidates for the client invoice screen (prescriptions, lab orders, visits).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const patientId = Number(searchParams.get("patientId"));
    const branchId = Number(searchParams.get("branchId"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const emergency = searchParams.get("emergency");

    if (!Number.isInteger(patientId) || patientId <= 0 || !Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "Valid client and branch are required." }, { status: 400 });
    }

    const [canRx, canLab, canAppt] = await Promise.all([
      (await userHasPermission(auth.userId, "prescriptions.view")) &&
        (await userHasPermission(auth.userId, "pharmacy.view")),
      userHasPermission(auth.userId, "lab.view"),
      userHasPermission(auth.userId, "appointments.view"),
    ]);

    const apptDateWhere = appointmentDateFilter(from, to);
    const appointmentNested: {
      branchId: number;
      appointmentDate?: { gte?: Date; lte?: Date };
    } = { branchId };
    if (apptDateWhere) appointmentNested.appointmentDate = apptDateWhere;

    const emergencyWhere =
      emergency === "yes" ? { isEmergency: true } : emergency === "no" ? { isEmergency: false } : {};

    const [prescriptions, labOrders, appointments] = await Promise.all([
      canRx
        ? prisma.prescription.findMany({
            where: {
              patientId,
              appointment: appointmentNested,
              ...emergencyWhere,
            },
            include: {
              patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
              doctor: { select: { id: true, name: true } },
              appointment: {
                select: {
                  id: true,
                  appointmentDate: true,
                  startTime: true,
                  branch: { select: { id: true, name: true } },
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      sellingPrice: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : [],
      canLab
        ? prisma.labOrder.findMany({
            where: {
              patientId,
              status: { not: "cancelled" },
              appointment: appointmentNested,
            },
            include: {
              doctor: { select: { id: true, name: true } },
              appointment: {
                select: {
                  id: true,
                  appointmentDate: true,
                  startTime: true,
                  branch: { select: { id: true, name: true } },
                },
              },
              items: { select: { id: true, unitPrice: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        : [],
      canAppt
        ? prisma.appointment.findMany({
            where: {
              patientId,
              branchId,
              status: { not: "cancelled" },
              ...(apptDateWhere ? { appointmentDate: apptDateWhere } : {}),
            },
            include: {
              doctor: { select: { id: true, name: true } },
              branch: { select: { id: true, name: true } },
              services: {
                select: {
                  id: true,
                  quantity: true,
                  unitPrice: true,
                  totalAmount: true,
                  service: { select: { name: true } },
                },
              },
            },
            orderBy: { appointmentDate: "desc" },
            take: 200,
          })
        : [],
    ]);

    return NextResponse.json({
      prescriptions: prescriptions.map((rx) => ({
        ...rx,
        patient: serializePatient(rx.patient),
      })),
      labOrders: labOrders.map((o) => ({
        id: o.id,
        status: o.status,
        totalAmount: o.totalAmount,
        itemCount: o.items.length,
        doctor: o.doctor,
        appointment: o.appointment,
      })),
      appointments: appointments.map((a) => {
        const serviceTotal = a.services.reduce((s, x) => s + (x.totalAmount ?? 0), 0);
        return {
          id: a.id,
          appointmentDate: a.appointmentDate,
          startTime: a.startTime,
          totalAmount: a.totalAmount,
          doctor: a.doctor,
          branch: a.branch,
          serviceCount: a.services.length,
          servicesSummary:
            a.services.length > 0
              ? a.services.map((s) => `${s.quantity}× ${s.service.name}`).join("; ")
              : null,
          lineTotalFromServices: serviceTotal,
        };
      }),
      permissions: { prescriptions: canRx, labs: canLab, appointments: canAppt },
    });
  } catch (e) {
    console.error("Client invoice candidates error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
