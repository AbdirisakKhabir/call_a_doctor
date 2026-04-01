import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const finalWhere = search
      ? {
          isActive: true,
          OR: [
            { name: { contains: search } },
            { patientCode: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : { isActive: true };

    if (paginate) {
      const [patients, total] = await Promise.all([
        prisma.patient.findMany({
          where: finalWhere,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.patient.count({ where: finalWhere }),
      ]);
      return NextResponse.json({ data: patients, total, page, pageSize });
    }

    const patients = await prisma.patient.findMany({
      where: finalWhere,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(patients);
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
    const { name, phone, email, dateOfBirth, gender, address, notes } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const count = await prisma.patient.count();
    const patientCode = `PAT-${String(count + 1).padStart(4, "0")}`;

    const patient = await prisma.patient.create({
      data: {
        patientCode,
        name: String(name).trim(),
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender ? String(gender).trim() : null,
        address: address ? String(address).trim() : null,
        notes: notes ? String(notes).trim() : null,
      },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "patient.create",
      module: "patients",
      resourceType: "Patient",
      resourceId: patient.id,
      metadata: { patientCode: patient.patientCode, name: patient.name },
    });
    return NextResponse.json(patient);
  } catch (e) {
    console.error("Create patient error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
