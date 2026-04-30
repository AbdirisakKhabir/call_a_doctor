import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";

export type ClientInvoiceLine = {
  lineKind: "medication" | "visit_service" | "lab_test";
  prescriptionId: number | null;
  appointmentId: number | null;
  labOrderId: number | null;
  prescriptionDate: string;
  doctorName: string;
  branchName: string;
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  dosage: string | null;
  instructions: string | null;
};

export type ClientInvoicePayload = {
  patient: ReturnType<typeof serializePatient>;
  generatedAt: string;
  prescriptions: {
    id: number;
    prescriptionDate: string;
    doctorName: string;
    branchName: string;
    notes: string | null;
  }[];
  labOrders: { id: number; visitDate: string; doctorName: string; branchName: string; totalAmount: number }[];
  appointments: { id: number; visitDate: string; doctorName: string; branchName: string }[];
  lines: ClientInvoiceLine[];
  subtotal: number;
  currency: string;
};

function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function parsePositiveIntSet(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(nums)];
}

export async function buildClientInvoicePayload(args: {
  userId: number;
  patientId: number;
  branchId: number;
  prescriptionIds: unknown;
  labOrderIds: unknown;
  appointmentIds: unknown;
  /** When true, append calendar service lines for each distinct appointment linked to selected prescriptions. */
  includeVisitServiceFeesFromPrescriptions?: boolean;
}): Promise<{ ok: true; payload: ClientInvoicePayload } | { ok: false; error: string; status: number }> {
  const prescriptionIds = parsePositiveIntSet(args.prescriptionIds);
  const labOrderIds = parsePositiveIntSet(args.labOrderIds);
  let appointmentIdsList = parsePositiveIntSet(args.appointmentIds);
  const includeVisitFromRx = args.includeVisitServiceFeesFromPrescriptions === true;

  if (
    prescriptionIds.length === 0 &&
    labOrderIds.length === 0 &&
    appointmentIdsList.length === 0 &&
    !includeVisitFromRx
  ) {
    return { ok: false, error: "Select at least one prescription, lab order, or visit.", status: 400 };
  }

  if (includeVisitFromRx && prescriptionIds.length === 0) {
    return {
      ok: false,
      error: "Include visit fees from prescriptions requires at least one prescription selected.",
      status: 400,
    };
  }

  const [canRx, canLab, canAppt] = await Promise.all([
    (await userHasPermission(args.userId, "prescriptions.view")) &&
      (await userHasPermission(args.userId, "pharmacy.view")),
    userHasPermission(args.userId, "lab.view"),
    userHasPermission(args.userId, "appointments.view"),
  ]);

  if (prescriptionIds.length > 0 && !canRx) {
    return { ok: false, error: "You do not have permission to invoice prescriptions.", status: 403 };
  }
  if (labOrderIds.length > 0 && !canLab) {
    return { ok: false, error: "You do not have permission to invoice laboratory orders.", status: 403 };
  }
  if ((appointmentIdsList.length > 0 || includeVisitFromRx) && !canAppt) {
    return { ok: false, error: "You do not have permission to invoice visit services.", status: 403 };
  }

  const lines: ClientInvoiceLine[] = [];
  let subtotal = 0;

  const prescriptionSummaries: ClientInvoicePayload["prescriptions"] = [];
  const labSummaries: ClientInvoicePayload["labOrders"] = [];
  const appointmentSummaries: ClientInvoicePayload["appointments"] = [];

  let patientRow: {
    id: number;
    patientCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    mobile: string | null;
    email: string | null;
    address: string | null;
  } | null = null;

  // --- Prescriptions (medications) ---
  if (prescriptionIds.length > 0) {
    const prescriptions = await prisma.prescription.findMany({
      where: { id: { in: prescriptionIds }, patientId: args.patientId },
      include: {
        patient: {
          select: {
            id: true,
            patientCode: true,
            firstName: true,
            lastName: true,
            phone: true,
            mobile: true,
            email: true,
            address: true,
          },
        },
        doctor: { select: { id: true, name: true } },
        appointment: {
          include: {
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
                unit: true,
              },
            },
          },
        },
      },
    });

    if (prescriptions.length !== prescriptionIds.length) {
      return { ok: false, error: "One or more prescriptions were not found for this client.", status: 400 };
    }

    for (const rx of prescriptions) {
      if (rx.appointment.branchId !== args.branchId) {
        return {
          ok: false,
          error: `Prescription #${rx.id} is not for the selected branch.`,
          status: 400,
        };
      }
    }

    patientRow = prescriptions[0].patient;
    const sortedRx = [...prescriptions].sort(
      (a, b) =>
        new Date(a.appointment.appointmentDate).getTime() -
        new Date(b.appointment.appointmentDate).getTime()
    );

    for (const rx of sortedRx) {
      const dateStr = toDateStr(rx.appointment.appointmentDate);
      const branchName = rx.appointment.branch.name;
      const doctorName = rx.doctor.name;
      prescriptionSummaries.push({
        id: rx.id,
        prescriptionDate: dateStr,
        doctorName,
        branchName,
        notes: rx.notes,
      });

      for (const item of rx.items) {
        const unitPrice = Math.max(0, item.product.sellingPrice ?? 0);
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        lines.push({
          lineKind: "medication",
          prescriptionId: rx.id,
          appointmentId: rx.appointmentId,
          labOrderId: null,
          prescriptionDate: dateStr,
          doctorName,
          branchName,
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

    if (includeVisitFromRx) {
      const extraAppts = [...new Set(sortedRx.map((rx) => rx.appointmentId))];
      appointmentIdsList = [...new Set([...appointmentIdsList, ...extraAppts])];
    }
  }

  const uniqueAppointmentIds = [...new Set(appointmentIdsList)];

  // --- Lab orders ---
  if (labOrderIds.length > 0) {
    const orders = await prisma.labOrder.findMany({
      where: {
        id: { in: labOrderIds },
        patientId: args.patientId,
        status: { not: "cancelled" },
      },
      include: {
        doctor: { select: { name: true } },
        appointment: {
          include: { branch: { select: { id: true, name: true } } },
        },
        items: {
          include: {
            labTest: { select: { id: true, name: true, code: true } },
          },
          orderBy: { id: "asc" as const },
        },
      },
    });

    if (orders.length !== labOrderIds.length) {
      return { ok: false, error: "One or more lab orders were not found for this client.", status: 400 };
    }

    for (const lo of orders) {
      if (lo.appointment.branchId !== args.branchId) {
        return { ok: false, error: `Lab order #${lo.id} is not for the selected branch.`, status: 400 };
      }
    }

    if (!patientRow) {
      patientRow = await prisma.patient.findUnique({
        where: { id: args.patientId },
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
          email: true,
          address: true,
        },
      });
    }
    if (!patientRow) {
      return { ok: false, error: "Client not found.", status: 404 };
    }

    const sortedLabs = [...orders].sort(
      (a, b) =>
        new Date(a.appointment.appointmentDate).getTime() -
        new Date(b.appointment.appointmentDate).getTime()
    );

    for (const lo of sortedLabs) {
      const dateStr = toDateStr(lo.appointment.appointmentDate);
      labSummaries.push({
        id: lo.id,
        visitDate: dateStr,
        doctorName: lo.doctor.name,
        branchName: lo.appointment.branch.name,
        totalAmount: lo.totalAmount ?? 0,
      });

      for (const row of lo.items) {
        const unitPrice = Math.max(0, row.unitPrice ?? 0);
        const lineTotal = unitPrice;
        subtotal += lineTotal;
        lines.push({
          lineKind: "lab_test",
          prescriptionId: null,
          appointmentId: lo.appointmentId,
          labOrderId: lo.id,
          prescriptionDate: dateStr,
          doctorName: lo.doctor.name,
          branchName: lo.appointment.branch.name,
          productName: row.labTest.name,
          productCode: row.labTest.code?.trim() ? row.labTest.code : "LAB",
          quantity: 1,
          unitPrice,
          lineTotal,
          dosage: null,
          instructions: null,
        });
      }
    }
  }

  // --- Visit services (explicit appointments; includes those merged from includeVisitFromRx) ---
  if (uniqueAppointmentIds.length > 0) {
    const appointments = await prisma.appointment.findMany({
      where: {
        id: { in: uniqueAppointmentIds },
        patientId: args.patientId,
        branchId: args.branchId,
        status: { not: "cancelled" },
      },
      include: {
        doctor: { select: { name: true } },
        branch: { select: { name: true } },
        services: {
          include: { service: { select: { name: true } } },
          orderBy: { id: "asc" as const },
        },
      },
    });

    if (appointments.length !== uniqueAppointmentIds.length) {
      return { ok: false, error: "One or more visits were not found for this client and branch.", status: 400 };
    }

    if (!patientRow) {
      patientRow = await prisma.patient.findUnique({
        where: { id: args.patientId },
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
          mobile: true,
          email: true,
          address: true,
        },
      });
    }
    if (!patientRow) {
      return { ok: false, error: "Client not found.", status: 404 };
    }

    const sortedAppt = [...appointments].sort(
      (a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()
    );

    for (const appt of sortedAppt) {
      const dateStr = toDateStr(appt.appointmentDate);
      appointmentSummaries.push({
        id: appt.id,
        visitDate: dateStr,
        doctorName: appt.doctor.name,
        branchName: appt.branch.name,
      });

      if (appt.services.length > 0) {
        for (const row of appt.services) {
          const qty = Math.max(1, row.quantity ?? 1);
          const unitPrice = Math.max(0, row.unitPrice ?? 0);
          const lineTotal = Math.max(0, row.totalAmount ?? unitPrice * qty);
          subtotal += lineTotal;
          lines.push({
            lineKind: "visit_service",
            prescriptionId: null,
            appointmentId: appt.id,
            labOrderId: null,
            prescriptionDate: dateStr,
            doctorName: appt.doctor.name,
            branchName: appt.branch.name,
            productName: row.service.name,
            productCode: "SERVICE",
            quantity: qty,
            unitPrice,
            lineTotal,
            dosage: null,
            instructions: null,
          });
        }
      } else {
        const total = Math.max(0, appt.totalAmount ?? 0);
        if (total > 0) {
          subtotal += total;
          lines.push({
            lineKind: "visit_service",
            prescriptionId: null,
            appointmentId: appt.id,
            labOrderId: null,
            prescriptionDate: dateStr,
            doctorName: appt.doctor.name,
            branchName: appt.branch.name,
            productName: "Visit fee",
            productCode: "VISIT",
            quantity: 1,
            unitPrice: total,
            lineTotal: total,
            dosage: null,
            instructions: null,
          });
        }
      }
    }
  }

  if (!patientRow) {
    patientRow = await prisma.patient.findUnique({
      where: { id: args.patientId },
      select: {
        id: true,
        patientCode: true,
        firstName: true,
        lastName: true,
        phone: true,
        mobile: true,
        email: true,
        address: true,
      },
    });
  }
  if (!patientRow) {
    return { ok: false, error: "Client not found.", status: 404 };
  }

  const sortLines = (a: ClientInvoiceLine, b: ClientInvoiceLine) => {
    const d = a.prescriptionDate.localeCompare(b.prescriptionDate);
    if (d !== 0) return d;
    const order = (k: ClientInvoiceLine["lineKind"]) =>
      k === "medication" ? 0 : k === "lab_test" ? 1 : 2;
    return order(a.lineKind) - order(b.lineKind);
  };
  lines.sort(sortLines);

  if (lines.length === 0) {
    return {
      ok: false,
      error: "No billable lines — check product prices, visit services, or lab line totals.",
      status: 400,
    };
  }

  const payload: ClientInvoicePayload = {
    patient: serializePatient(patientRow),
    generatedAt: new Date().toISOString(),
    prescriptions: prescriptionSummaries,
    labOrders: labSummaries,
    appointments: appointmentSummaries,
    lines,
    subtotal,
    currency: "USD",
  };

  return { ok: true, payload };
}
