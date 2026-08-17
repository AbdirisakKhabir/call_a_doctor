import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: parsedId },
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
            gender: true,
            age: true,
            dateOfBirth: true,
            notes: true,
            phone: true,
          },
        },
        doctor: { select: { id: true, name: true, specialty: true } },
        createdBy: { select: { id: true, name: true } },
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
                unit: true,
                sellingPrice: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!prescription) {
      return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
    }

    return NextResponse.json({ ...prescription, patient: serializePatient(prescription.patient) });
  } catch (e) {
    console.error("GET prescription error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
