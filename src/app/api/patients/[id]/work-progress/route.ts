import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { serializePatient } from "@/lib/patient-name";
import { getVisitCardAccess, canSeeVisitCardRow } from "@/lib/visit-card-access";

export type WorkProgressStepState = "pending" | "in_progress" | "done" | "cancelled" | "skipped";

type WorkProgressStep = {
  key: string;
  label: string;
  detail: string | null;
  state: WorkProgressStepState;
  href: string | null;
};

type AppointmentWorkRow = {
  kind: "appointment";
  id: number;
  sortAt: string;
  appointmentDate: string;
  startTime: string;
  branch: { id: number; name: string };
  doctor: { id: number; name: string };
  visitStatus: string;
  steps: WorkProgressStep[];
};

type VisitCardWorkRow = {
  kind: "visit_card";
  id: number;
  sortAt: string;
  cardNumber: string;
  visitDate: string;
  branch: { id: number; name: string };
  doctor: { id: number; name: string };
  status: string;
  paymentStatus: string;
  visitFee: number;
  steps: WorkProgressStep[];
};

type CareFileWorkRow = {
  id: number;
  fileCode: string;
  title: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
};

function apptStepState(status: string): WorkProgressStepState {
  if (status === "completed") return "done";
  if (status === "cancelled" || status === "no-show") return "cancelled";
  return "pending";
}

function labOrderStepState(orderStatus: string, completedLines: number, totalLines: number): WorkProgressStepState {
  if (orderStatus === "cancelled") return "cancelled";
  if (orderStatus === "completed" || (totalLines > 0 && completedLines === totalLines)) return "done";
  if (completedLines > 0) return "in_progress";
  return "pending";
}

function rxStepState(rxStatus: string, dispensedUnits: number, orderedUnits: number): WorkProgressStepState {
  if (rxStatus === "cancelled") return "cancelled";
  if (rxStatus === "dispensed" || (orderedUnits > 0 && dispensedUnits >= orderedUnits)) return "done";
  if (dispensedUnits > 0) return "in_progress";
  return "pending";
}

type SelectedAppointmentForProgress = {
  id: number;
  status: string;
  appointmentDate: Date;
  startTime: string;
  doctor: { id: number; name: string };
  branch: { id: number; name: string };
  services: Array<{
    quantity: number;
    disposablesDeductedAt: Date | null;
    service: { name: string };
  }>;
  labOrders?: Array<{
    id: number;
    status: string;
    items: Array<{ status: string }>;
  }>;
  prescriptions?: Array<{
    id: number;
    status: string;
    items: Array<{ quantity: number; dispensedQty: number | null }>;
  }>;
};

function visitCardStepState(status: string): WorkProgressStepState {
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  if (status === "inProgress") return "in_progress";
  return "pending";
}

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

    const [canAppt, canLabs, canRx, canFormsView, canPhView, canPhCreate] = await Promise.all([
      userHasPermission(auth.userId, "appointments.view"),
      userHasPermission(auth.userId, "lab.view"),
      userHasPermission(auth.userId, "prescriptions.view"),
      userHasPermission(auth.userId, "forms.view"),
      userHasPermission(auth.userId, "patient_history.view"),
      userHasPermission(auth.userId, "patient_history.create"),
    ]);
    const canFormResponses = canFormsView || canPhView || canPhCreate;

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

    const [appointments, formCountByAppt, billingByAppt, careFiles] = await Promise.all([
      canAppt
        ? prisma.appointment.findMany({
            where: { patientId },
            orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
            take: 50,
            select: {
              id: true,
              status: true,
              appointmentDate: true,
              startTime: true,
              doctor: { select: { id: true, name: true } },
              branch: { select: { id: true, name: true } },
              services: {
                select: {
                  quantity: true,
                  disposablesDeductedAt: true,
                  service: { select: { name: true } },
                },
              },
              ...(canLabs
                ? {
                    labOrders: {
                      select: {
                        id: true,
                        status: true,
                        items: { select: { status: true } },
                      },
                    },
                  }
                : {}),
              ...(canRx
                ? {
                    prescriptions: {
                      select: {
                        id: true,
                        status: true,
                        items: { select: { quantity: true, dispensedQty: true } },
                      },
                    },
                  }
                : {}),
            },
          })
        : [],
      canFormResponses
        ? prisma.customFormResponse.groupBy({
            by: ["appointmentId"],
            where: { patientId, appointmentId: { not: null } },
            _count: { _all: true },
          })
        : [],
      canAppt
        ? prisma.sale.findMany({
            where: {
              patientId,
              appointmentId: { not: null },
              kind: "appointment",
            },
            select: { appointmentId: true },
          })
        : [],
      prisma.patientCareFile.findMany({
        where: { patientId },
        orderBy: { openedAt: "desc" },
        take: 30,
        select: {
          id: true,
          fileCode: true,
          title: true,
          status: true,
          openedAt: true,
          closedAt: true,
        },
      }),
    ]);

    const formCountMap = new Map<number, number>();
    for (const row of formCountByAppt) {
      if (row.appointmentId != null) formCountMap.set(row.appointmentId, row._count._all);
    }

    const billedApptIds = new Set(
      billingByAppt.map((s) => s.appointmentId).filter((x): x is number => x != null)
    );

    const appointmentRows: AppointmentWorkRow[] = (
      appointments as unknown as SelectedAppointmentForProgress[]
    ).map((a) => {
      const dateIso = a.appointmentDate.toISOString().slice(0, 10);
      const sortAt = `${dateIso}T${a.startTime || "00:00"}:00`;

      const steps: WorkProgressStep[] = [];

      const visitState = apptStepState(a.status);
      steps.push({
        key: "visit",
        label: "Visit",
        detail:
          a.status === "completed"
            ? "Completed"
            : a.status === "cancelled"
              ? "Cancelled"
              : a.status === "no-show"
                ? "No-show"
                : "Scheduled",
        state: visitState,
        href: `/appointments`,
      });

      const svcLines = a.services.length;
      const svcWithDisp = a.services.filter((s) => s.disposablesDeductedAt != null).length;
      if (svcLines === 0) {
        steps.push({
          key: "services",
          label: "Booked services",
          detail: "No service lines on this booking",
          state: "skipped",
          href: null,
        });
      } else {
        const allDone = svcWithDisp === svcLines;
        steps.push({
          key: "services",
          label: "Service supplies",
          detail: `${svcWithDisp} of ${svcLines} line(s) marked supplied`,
          state: allDone ? "done" : visitState === "cancelled" ? "cancelled" : "in_progress",
          href: `/appointments`,
        });
      }

      steps.push({
        key: "billing",
        label: "Visit billing",
        detail: billedApptIds.has(a.id) ? "Posted to pharmacy / ledger" : "Not posted yet",
        state: billedApptIds.has(a.id) ? "done" : visitState === "cancelled" ? "skipped" : "pending",
        href: `/appointments`,
      });

      const labOrders = "labOrders" in a && a.labOrders ? a.labOrders : [];
      if (!canLabs || labOrders.length === 0) {
        steps.push({
          key: "lab",
          label: "Laboratory",
          detail: canLabs ? "No lab orders for this visit" : "—",
          state: canLabs ? "skipped" : "skipped",
          href: canLabs ? `/lab/orders` : null,
        });
      } else {
        for (const lo of labOrders) {
          const items = lo.items;
          const total = items.length;
          const done = items.filter((it) => it.status === "completed").length;
          const st = labOrderStepState(lo.status, done, total);
          steps.push({
            key: `lab-${lo.id}`,
            label: `Lab order #${lo.id}`,
            detail: total === 0 ? lo.status : `${done}/${total} test line(s) recorded`,
            state: st,
            href: `/lab/orders/${lo.id}/results`,
          });
        }
      }

      const rxList = "prescriptions" in a && a.prescriptions ? a.prescriptions : [];
      if (!canRx || rxList.length === 0) {
        steps.push({
          key: "rx",
          label: "Prescriptions",
          detail: canRx ? "No prescriptions for this visit" : "—",
          state: canRx ? "skipped" : "skipped",
          href: canRx ? `/prescriptions` : null,
        });
      } else {
        for (const rx of rxList) {
          const ordered = rx.items.reduce((s, it) => s + it.quantity, 0);
          const dispensed = rx.items.reduce((s, it) => s + (it.dispensedQty ?? 0), 0);
          const st = rxStepState(rx.status, dispensed, ordered);
          steps.push({
            key: `rx-${rx.id}`,
            label: `Prescription #${rx.id}`,
            detail: `${rx.status.replace(/_/g, " ")} · ${dispensed}/${ordered} units dispensed`,
            state: st,
            href: `/prescriptions`,
          });
        }
      }

      const fc = formCountMap.get(a.id) ?? 0;
      steps.push({
        key: "forms",
        label: "Clinic forms",
        detail: fc === 0 ? "No submissions linked to this visit" : `${fc} submission(s)`,
        state: fc > 0 ? "done" : "pending",
        href: fc > 0 ? `/reports/form-submissions` : `/forms`,
      });

      return {
        kind: "appointment" as const,
        id: a.id,
        sortAt,
        appointmentDate: dateIso,
        startTime: a.startTime,
        branch: a.branch,
        doctor: a.doctor,
        visitStatus: a.status,
        steps,
      };
    });

    const vcAccess = await getVisitCardAccess(auth.userId);
    let visitCardRows: VisitCardWorkRow[] = [];
    if (vcAccess.viewAll || vcAccess.viewOwn) {
      const cards = await prisma.doctorVisitCard.findMany({
        where: { patientId },
        orderBy: [{ visitDate: "desc" }, { id: "desc" }],
        take: 40,
        select: {
          id: true,
          cardNumber: true,
          visitDate: true,
          status: true,
          paymentStatus: true,
          visitFee: true,
          doctorId: true,
          doctor: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      });
      const filtered = cards.filter((c) => canSeeVisitCardRow(vcAccess, c.doctorId));
      visitCardRows = filtered.map((c) => {
        const vd = c.visitDate.toISOString().slice(0, 10);
        const st = visitCardStepState(c.status);
        const steps: WorkProgressStep[] = [
          {
            key: "queue",
            label: "Reception queue",
            detail:
              c.status === "inWaiting"
                ? "Waiting"
                : c.status === "inProgress"
                  ? "With clinician"
                  : c.status === "completed"
                    ? "Completed"
                    : c.status === "cancelled"
                      ? "Cancelled"
                      : c.status,
            state: st,
            href: `/visit-cards/${c.id}`,
          },
          {
            key: "payment",
            label: "Visit payment",
            detail: `${c.paymentStatus}${c.visitFee > 0 ? ` · $${c.visitFee.toFixed(2)}` : ""}`,
            state:
              c.paymentStatus === "paid" ? "done" : c.status === "cancelled" ? "skipped" : "pending",
            href: `/visit-cards/${c.id}`,
          },
        ];
        return {
          kind: "visit_card" as const,
          id: c.id,
          sortAt: `${vd}T12:00:00`,
          cardNumber: c.cardNumber,
          visitDate: vd,
          branch: c.branch,
          doctor: c.doctor,
          status: c.status,
          paymentStatus: c.paymentStatus,
          visitFee: c.visitFee,
          steps,
        };
      });
    }

    const careFileRows: CareFileWorkRow[] = careFiles.map((f) => ({
      id: f.id,
      fileCode: f.fileCode,
      title: f.title,
      status: f.status,
      openedAt: f.openedAt.toISOString(),
      closedAt: f.closedAt ? f.closedAt.toISOString() : null,
    }));

    const timeline: Array<{ kind: "appointment"; row: AppointmentWorkRow } | { kind: "visit_card"; row: VisitCardWorkRow }> = [
      ...appointmentRows.map((row) => ({ kind: "appointment" as const, row })),
      ...visitCardRows.map((row) => ({ kind: "visit_card" as const, row })),
    ];
    timeline.sort((a, b) => (a.row.sortAt < b.row.sortAt ? 1 : a.row.sortAt > b.row.sortAt ? -1 : 0));

    return NextResponse.json({
      patient: serializePatient(patient),
      timeline,
      careFiles: careFileRows,
      access: {
        appointments: canAppt,
        lab: canLabs,
        prescriptions: canRx,
        forms: canFormResponses,
        visitCards: vcAccess.viewAll || vcAccess.viewOwn,
      },
    });
  } catch (e) {
    console.error("Work progress error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
