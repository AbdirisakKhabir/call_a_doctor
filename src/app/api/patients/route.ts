import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";
import { formatClientFullName, serializePatient } from "@/lib/patient-name";
import { resolveReferralSourceIdForWrite } from "@/lib/referral-source";
import { calculateAgeFromDate } from "@/lib/age-from-dob";
import { assertActiveBranch, assertVillageInCity } from "@/lib/patient-location";
import { buildPatientListWhere } from "@/lib/patient-list-filters";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

const patientInclude = {
  referralSource: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  village: { select: { id: true, name: true } },
  registeredBranch: { select: { id: true, name: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const balanceOnly =
      searchParams.get("balanceOnly") === "1" || searchParams.get("balanceOnly") === "true";

    const branchFilter = await getUserBranchIdFilter(auth.userId);
    const branchIdParam = searchParams.get("branchId");
    if (branchIdParam != null && branchIdParam.trim() !== "") {
      const bid = Number(branchIdParam);
      if (!Number.isInteger(bid) || bid <= 0) {
        return NextResponse.json({ error: "Invalid branch" }, { status: 400 });
      }
      if (branchFilter && !branchFilter.includes(bid)) {
        return NextResponse.json({ error: "Branch not allowed" }, { status: 403 });
      }
    }

    const finalWhere = buildPatientListWhere(searchParams, branchFilter);
    const orderBy = balanceOnly
      ? [{ accountBalance: "desc" as const }, { lastName: "asc" as const }, { firstName: "asc" as const }]
      : [{ lastName: "asc" as const }, { firstName: "asc" as const }];

    if (paginate) {
      const [patients, total, agg] = await Promise.all([
        prisma.patient.findMany({
          where: finalWhere,
          include: patientInclude,
          orderBy,
          skip,
          take: pageSize,
        }),
        prisma.patient.count({ where: finalWhere }),
        balanceOnly
          ? prisma.patient.aggregate({
              where: finalWhere,
              _sum: { accountBalance: true },
            })
          : Promise.resolve(null),
      ]);
      return NextResponse.json({
        data: patients.map((p) => serializePatient(p)),
        total,
        page,
        pageSize,
        ...(balanceOnly && agg
          ? { totalOutstanding: Math.round((agg._sum.accountBalance ?? 0) * 100) / 100 }
          : {}),
      });
    }

    const patients = await prisma.patient.findMany({
      where: finalWhere,
      include: patientInclude,
      orderBy,
    });

    return NextResponse.json(patients.map((p) => serializePatient(p)));
  } catch (e) {
    console.error("Patients list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      referralSourceId,
      cityId,
      villageId,
      registeredBranchId,
    } = body;

    const fn = typeof firstName === "string" ? firstName.trim() : "";
    const ln = typeof lastName === "string" ? lastName.trim() : "";
    if (!fn || !ln) {
      return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
    }

    const rb = Number(registeredBranchId);
    if (!Number.isInteger(rb)) {
      return NextResponse.json({ error: "Registration branch is required" }, { status: 400 });
    }
    if (!(await assertActiveBranch(rb))) {
      return NextResponse.json({ error: "Invalid or inactive registration branch" }, { status: 400 });
    }

    const cId = Number(cityId);
    const vId = Number(villageId);
    if (!Number.isInteger(cId) || !Number.isInteger(vId)) {
      return NextResponse.json({ error: "City and village are required" }, { status: 400 });
    }
    if (!(await assertVillageInCity(vId, cId))) {
      return NextResponse.json({ error: "Invalid or inactive city/village combination" }, { status: 400 });
    }

    const ref = await resolveReferralSourceIdForWrite(referralSourceId);
    if (!ref.ok) {
      return NextResponse.json({ error: ref.error }, { status: 400 });
    }

    const count = await prisma.patient.count();
    const patientCode = `PAT-${String(count + 1).padStart(4, "0")}`;
    const dob = dateOfBirth ? new Date(dateOfBirth) : null;

    const patient = await prisma.patient.create({
      data: {
        patientCode,
        firstName: fn,
        lastName: ln,
        phone: phone ? String(phone).trim() : null,
        mobile: mobile ? String(mobile).trim() : null,
        email: email ? String(email).trim() : null,
        dateOfBirth: dob,
        age: calculateAgeFromDate(dob),
        gender: gender ? String(gender).trim() : null,
        address: address ? String(address).trim() : null,
        cityId: cId,
        villageId: vId,
        registeredBranchId: rb,
        notes: notes ? String(notes).trim() : null,
        ...(ref.value !== undefined && ref.value !== null ? { referralSourceId: ref.value } : {}),
      },
      include: patientInclude,
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.create",
      module: "patients",
      resourceType: "Patient",
      resourceId: patient.id,
      metadata: { patientCode: patient.patientCode, name: formatClientFullName(patient) },
    });
    return NextResponse.json(serializePatient(patient));
  } catch (e) {
    console.error("Create patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
