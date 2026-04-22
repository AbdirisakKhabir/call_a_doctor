import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditFromRequest } from "@/lib/audit-log";
import { formatClientFullName, serializePatient } from "@/lib/patient-name";
import { resolveReferralSourceIdForWrite } from "@/lib/referral-source";
import { calculateAgeFromDate } from "@/lib/age-from-dob";
import { assertActiveBranch, assertVillageInCity } from "@/lib/patient-location";

const patientInclude = {
  referralSource: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  village: { select: { id: true, name: true } },
  registeredBranch: { select: { id: true, name: true } },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(_req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parsedId },
      include: patientInclude,
    });
    if (!patient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const [completed, cancelled, noShow, recentAppointments] = await Promise.all([
      prisma.appointment.count({ where: { patientId: parsedId, status: "completed" } }),
      prisma.appointment.count({ where: { patientId: parsedId, status: "cancelled" } }),
      prisma.appointment.count({ where: { patientId: parsedId, status: "no-show" } }),
      prisma.appointment.findMany({
        where: { patientId: parsedId },
        orderBy: [{ appointmentDate: "desc" }, { startTime: "desc" }],
        take: 3,
        include: {
          services: {
            include: { service: { select: { id: true, name: true, durationMinutes: true, price: true, color: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({
      ...serializePatient(patient),
      appointmentStats: { completed, cancelled, noShow },
      recentAppointments,
    });
  } catch (e) {
    console.error("Get patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      phone,
      mobile,
      email,
      dateOfBirth,
      gender,
      address,
      notes,
      isActive,
      referralSourceId,
      cityId,
      villageId,
      registeredBranchId,
    } = body;

    const data: Record<string, unknown> = {};
    if (typeof firstName === "string" && typeof lastName === "string") {
      const fn = firstName.trim();
      const ln = lastName.trim();
      if (!fn || !ln) {
        return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
      }
      data.firstName = fn;
      data.lastName = ln;
    }
    if (typeof phone !== "undefined") data.phone = phone ? String(phone).trim() : null;
    if (typeof mobile !== "undefined") data.mobile = mobile ? String(mobile).trim() : null;
    if (typeof email !== "undefined") data.email = email ? String(email).trim() : null;
    if (typeof dateOfBirth !== "undefined") {
      const dob = dateOfBirth ? new Date(dateOfBirth) : null;
      data.dateOfBirth = dob;
      data.age = calculateAgeFromDate(dob);
    }
    if (typeof gender !== "undefined") data.gender = gender ? String(gender).trim() : null;
    if (typeof address !== "undefined") data.address = address ? String(address).trim() : null;
    if (typeof notes !== "undefined") data.notes = notes ? String(notes).trim() : null;
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof referralSourceId !== "undefined") {
      const ref = await resolveReferralSourceIdForWrite(referralSourceId);
      if (!ref.ok) {
        return NextResponse.json({ error: ref.error }, { status: 400 });
      }
      data.referralSourceId = ref.value ?? null;
    }

    const localityPartial =
      typeof cityId !== "undefined" || typeof villageId !== "undefined";
    if (localityPartial) {
      if (typeof cityId === "undefined" || typeof villageId === "undefined") {
        return NextResponse.json(
          { error: "Send both city and village when updating locality" },
          { status: 400 }
        );
      }
      const cId = Number(cityId);
      const vId = Number(villageId);
      if (!Number.isInteger(cId) || !Number.isInteger(vId)) {
        return NextResponse.json({ error: "Invalid city or village" }, { status: 400 });
      }
      if (!(await assertVillageInCity(vId, cId))) {
        return NextResponse.json({ error: "Invalid or inactive city/village combination" }, { status: 400 });
      }
      data.cityId = cId;
      data.villageId = vId;
    }
    if (typeof registeredBranchId !== "undefined") {
      const rb = Number(registeredBranchId);
      if (!Number.isInteger(rb)) {
        return NextResponse.json({ error: "Registration branch is required" }, { status: 400 });
      }
      if (!(await assertActiveBranch(rb))) {
        return NextResponse.json({ error: "Invalid or inactive registration branch" }, { status: 400 });
      }
      data.registeredBranchId = rb;
    }

    const patient = await prisma.patient.update({
      where: { id: parsedId },
      data,
      include: patientInclude,
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.update",
      module: "patients",
      resourceType: "Patient",
      resourceId: parsedId,
      metadata: { keys: Object.keys(data) },
    });
    return NextResponse.json(serializePatient(patient));
  } catch (e) {
    console.error("Update patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    await prisma.patient.delete({ where: { id: parsedId } });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.delete",
      module: "patients",
      resourceType: "Patient",
      resourceId: parsedId,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
