import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ConsolidatedInvoiceLine = {
  prescriptionId: number;
  prescriptionDate: string;
  doctorName: string;
  branchName: string;
  productId: number;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  dosage: string | null;
  instructions: string | null;
};

/**
 * Build one consolidated medication invoice from multiple prescriptions (same patient, any dates).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const idsRaw = body.prescriptionIds;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "Select at least one prescription." },
        { status: 400 }
      );
    }

    const prescriptionIds = [...new Set(idsRaw.map((x: unknown) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
    if (prescriptionIds.length === 0) {
      return NextResponse.json({ error: "Invalid prescription ids." }, { status: 400 });
    }

    const prescriptions = await prisma.prescription.findMany({
      where: { id: { in: prescriptionIds } },
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        doctor: { select: { id: true, name: true } },
        appointment: {
          include: {
            branch: { select: { id: true, name: true, address: true, phone: true } },
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
                unit: true,
              },
            },
          },
        },
      },
    });

    if (prescriptions.length !== prescriptionIds.length) {
      return NextResponse.json(
        { error: "One or more prescriptions were not found." },
        { status: 400 }
      );
    }

    const patientIds = new Set(prescriptions.map((p) => p.patientId));
    if (patientIds.size !== 1) {
      return NextResponse.json(
        { error: "All selected prescriptions must be for the same patient." },
        { status: 400 }
      );
    }

    const patient = prescriptions[0].patient;

    const sorted = [...prescriptions].sort(
      (a, b) =>
        new Date(a.appointment.appointmentDate).getTime() -
        new Date(b.appointment.appointmentDate).getTime()
    );

    const lines: ConsolidatedInvoiceLine[] = [];
    let subtotal = 0;

    for (const rx of sorted) {
      const apptDate = rx.appointment.appointmentDate;
      const dateStr =
        apptDate instanceof Date
          ? apptDate.toISOString().slice(0, 10)
          : String(apptDate).slice(0, 10);
      const branchName = rx.appointment.branch.name;
      const doctorName = rx.doctor.name;

      for (const item of rx.items) {
        const unitPrice = Math.max(0, item.product.sellingPrice ?? 0);
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        lines.push({
          prescriptionId: rx.id,
          prescriptionDate: dateStr,
          doctorName,
          branchName,
          productId: item.productId,
          productName: item.product.name,
          productCode: item.product.code,
          quantity: item.quantity,
          unitPrice,
          lineTotal,
          dosage: item.dosage,
          instructions: item.instructions,
        });
      }
    }

    const prescriptionSummaries = sorted.map((rx) => {
      const d = rx.appointment.appointmentDate;
      const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      return {
        id: rx.id,
        prescriptionDate: dateStr,
        doctorName: rx.doctor.name,
        branchName: rx.appointment.branch.name,
        notes: rx.notes,
      };
    });

    return NextResponse.json({
      patient,
      generatedAt: new Date().toISOString(),
      prescriptions: prescriptionSummaries,
      lines,
      subtotal,
      currency: "USD",
    });
  } catch (e) {
    console.error("Consolidated invoice error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
