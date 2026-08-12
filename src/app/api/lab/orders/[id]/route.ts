import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";
import { userHasPermission } from "@/lib/permissions";
import { recordTrashEntry, toTrashSnapshot } from "@/lib/trash";
import { logAuditFromRequest } from "@/lib/audit-log";
import { roundMoney } from "@/lib/lab-fee-settlement";
import {
  loadActivePaymentGroup,
  reversePatientPaymentGroup,
} from "@/lib/patient-payment-reverse";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const order = await prisma.labOrder.findUnique({
      where: { id: parsedId },
      include: {
        patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, gender: true, age: true, dateOfBirth: true } },
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
              select: {
                id: true,
                name: true,
                unit: true,
                normalRange: true,
                price: true,
                parentTestId: true,
                category: { select: { id: true, name: true } },
              },
            },
            panelParentTest: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...order, patient: serializePatient(order.patient) });
  } catch (e) {
    console.error("Lab order get error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * Delete a lab request and its line results.
 * Reverses linked active lab payments, undoes the patient account charge, then hard-deletes
 * (items cascade). Snapshot kept in recycle bin.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findUnique({
        where: { id: parsedId },
        include: {
          patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
          doctor: { select: { id: true, name: true } },
          items: {
            include: {
              labTest: { select: { id: true, name: true, code: true } },
            },
          },
          patientPayments: {
            where: { cancelledAt: null },
            select: {
              id: true,
              category: true,
              labOrderId: true,
              batchGroupId: true,
              amount: true,
              discount: true,
            },
          },
        },
      });
      if (!order) throw new Error("NOT_FOUND");

      const activePayments = order.patientPayments;
      const processedGroupKeys = new Set<string>();
      let paymentsReversed = 0;

      for (const seed of activePayments) {
        const groupKey = seed.batchGroupId ? `b:${seed.batchGroupId}` : `p:${seed.id}`;
        if (processedGroupKeys.has(groupKey)) continue;
        processedGroupKeys.add(groupKey);

        const loaded = await loadActivePaymentGroup(tx, seed.id);
        if (loaded.kind === "not_found" || loaded.kind === "already_cancelled") continue;

        const { group, patientId, patientCode } = loaded;
        const unsafe = group.some(
          (p) =>
            p.category !== "laboratory" ||
            p.labOrderId !== parsedId
        );
        if (unsafe) {
          throw new Error(
            "BAD_REQUEST:This request has payments that are part of a mixed payment batch. Cancel those payments under Finance first, then delete the request."
          );
        }

        const idsLabel = group.map((g) => g.id).join(", #");
        await reversePatientPaymentGroup(tx, {
          group,
          patientId,
          patientCode,
          userId: auth.userId,
          withdrawalDescription: `Delete lab request #${parsedId} — reverse payment ${patientCode} (#${idsLabel})`,
        });
        const now = new Date();
        await tx.patientPayment.updateMany({
          where: { id: { in: group.map((g) => g.id) } },
          data: { cancelledAt: now, cancelledById: auth.userId },
        });
        paymentsReversed += group.length;
      }

      // Undo the original patient charge from order creation (balance was incremented by totalAmount).
      const charge = roundMoney(order.totalAmount ?? 0);
      if (charge > 0) {
        await tx.patient.update({
          where: { id: order.patientId },
          data: { accountBalance: { decrement: charge } },
        });
      }

      const patientLabel =
        [order.patient.firstName, order.patient.lastName].filter(Boolean).join(" ").trim() ||
        order.patient.patientCode;

      await recordTrashEntry(tx, {
        entityType: "LabOrder",
        recordId: parsedId,
        title: `Lab request #${parsedId}`,
        detail: `${patientLabel} · ${order.doctor.name} · ${order.items.length} test(s)`,
        snapshot: toTrashSnapshot(order),
        deletedById: auth.userId,
      });

      await tx.labOrder.delete({ where: { id: parsedId } });

      return {
        id: parsedId,
        patientId: order.patientId,
        patientCode: order.patient.patientCode,
        itemCount: order.items.length,
        totalAmount: charge,
        paymentsReversed,
      };
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "lab_order.delete",
      module: "lab",
      resourceType: "LabOrder",
      resourceId: result.id,
      metadata: {
        patientId: result.patientId,
        patientCode: result.patientCode,
        itemCount: result.itemCount,
        totalAmount: result.totalAmount,
        paymentsReversed: result.paymentsReversed,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Lab request not found" }, { status: 404 });
      }
      if (e.message.startsWith("BAD_REQUEST:")) {
        return NextResponse.json(
          { error: e.message.replace(/^BAD_REQUEST:/, "").trim() },
          { status: 400 }
        );
      }
    }
    console.error("Delete lab order error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
