import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Invalid patient id" }, { status: 400 });
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
        name: true,
        phone: true,
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
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const [canNotes, canLabs, canRx] = await Promise.all([
      userHasPermission(auth.userId, "patient_history.view") ||
        userHasPermission(auth.userId, "patient_history.create"),
      userHasPermission(auth.userId, "lab.view"),
      userHasPermission(auth.userId, "prescriptions.view"),
    ]);

    const [clinicalNotes, labOrders, prescriptions] = await Promise.all([
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
    ]);

    return NextResponse.json({
      patient,
      clinicalNotes,
      labOrders,
      prescriptions,
      canViewNotes: canNotes,
      canViewLabs: canLabs,
      canViewPrescriptions: canRx,
    });
  } catch (e) {
    console.error("Patient chart error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
