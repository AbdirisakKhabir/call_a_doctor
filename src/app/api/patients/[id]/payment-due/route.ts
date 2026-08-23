import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { getPatientPaymentDue } from "@/lib/patient-payment-due";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canPay =
      (await userHasPermission(auth.userId, "accounts.deposit")) ||
      (await userHasPermission(auth.userId, "pharmacy.pos"));
    if (!canPay) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const due = await getPatientPaymentDue(prisma, patientId);
    if (!due) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json(due);
  } catch (e) {
    console.error("Patient payment due error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
