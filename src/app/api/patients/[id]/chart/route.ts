import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const canPatients = await userHasPermission(auth.userId, "patients.view");
    if (!canPatients) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        mobile: true,
        email: true,
        dateOfBirth: true,
        gender: true,
        notes: true,
        accountBalance: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!patient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const [canNotes, canLabs, canRx, canFormResponses] = await Promise.all([
      userHasPermission(auth.userId, "patient_history.view") ||
        userHasPermission(auth.userId, "patient_history.create"),
      userHasPermission(auth.userId, "lab.view"),
      userHasPermission(auth.userId, "prescriptions.view"),
      userHasPermission(auth.userId, "patient_history.view") ||
        userHasPermission(auth.userId, "patient_history.create") ||
        userHasPermission(auth.userId, "forms.view"),
    ]);

    const [clinicalNotes, labOrders, prescriptions, formResponses] = await Promise.all([
      canNotes
        ? prisma.patientHistory.findMany({
            where: { patientId },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
              doctor: { select: { id: true, name: true } },
              appointment: { select: { id: true, appointmentDate: true, startTime: true } },
            },
          })
        : [],
      canLabs
        ? prisma.labOrder.findMany({
            where: { patientId },
            orderBy: { createdAt: "desc" },
            take: 100,
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
              items: {
                include: {
                  labTest: {
                    select: { id: true, name: true, unit: true, normalRange: true, code: true },
                  },
                },
                orderBy: { id: "asc" },
              },
            },
          })
        : [],
      canRx
        ? prisma.prescription.findMany({
            where: { patientId },
            orderBy: { createdAt: "desc" },
            take: 100,
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
              items: {
                include: {
                  product: { select: { id: true, name: true, code: true } },
                },
                orderBy: { id: "asc" },
              },
            },
          })
        : [],
      canFormResponses
        ? prisma.customFormResponse.findMany({
            where: { patientId },
            orderBy: { submittedAt: "desc" },
            take: 100,
            include: {
              form: { select: { id: true, title: true } },
              appointment: {
                select: {
                  id: true,
                  appointmentDate: true,
                  startTime: true,
                  branch: { select: { id: true, name: true } },
                },
              },
              submittedBy: { select: { id: true, name: true, email: true } },
              answers: { orderBy: { id: "asc" } },
            },
          })
        : [],
    ]);

    return NextResponse.json({
      patient: serializePatient(patient),
      clinicalNotes,
      labOrders,
      prescriptions,
      formResponses,
      canViewNotes: canNotes,
      canViewLabs: canLabs,
      canViewPrescriptions: canRx,
      canViewFormResponses: canFormResponses,
    });
  } catch (e) {
    console.error("Patient chart error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
