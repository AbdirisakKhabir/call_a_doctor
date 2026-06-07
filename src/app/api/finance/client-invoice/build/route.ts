import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import { buildClientInvoicePayload } from "@/lib/client-invoice-build";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canUse =
      ((await userHasPermission(auth.userId, "prescriptions.view")) &&
        (await userHasPermission(auth.userId, "pharmacy.view"))) ||
      (await userHasPermission(auth.userId, "lab.view")) ||
      (await userHasPermission(auth.userId, "appointments.view"));
    if (!canUse) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const patientId = Number(body.patientId);
    const branchId = Number(body.branchId);
    if (!Number.isInteger(patientId) || patientId <= 0 || !Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "Valid client and branch are required." }, { status: 400 });
    }

    const result = await buildClientInvoicePayload({
      userId: auth.userId,
      patientId,
      branchId,
      prescriptionIds: body.prescriptionIds,
      labOrderIds: body.labOrderIds,
      appointmentIds: body.appointmentIds,
      includeVisitServiceFeesFromPrescriptions: body.includeVisitServiceFees === true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.payload);
  } catch (e) {
    console.error("Client invoice build error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
