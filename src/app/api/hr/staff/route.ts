import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { normalizeWorkingDays } from "@/lib/hr-staff";

function parseSalary(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "hr.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("activeOnly") === "1";

    const rows = await prisma.staffMember.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ isActive: "desc" }, { hireDate: "desc" }, { name: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("HR staff list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "hr.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const workingHours = typeof body.workingHours === "string" ? body.workingHours.trim() : "";
    const hireDateRaw = typeof body.hireDate === "string" ? body.hireDate.trim() : "";
    const workingDays = normalizeWorkingDays(body.workingDays);

    if (!name || !phone || !address || !title || !workingHours || !hireDateRaw) {
      return NextResponse.json({ error: "Name, phone, address, title, hire date, and working hours are required." }, { status: 400 });
    }
    if (workingDays.length === 0) {
      return NextResponse.json({ error: "Select at least one working day." }, { status: 400 });
    }

    const hireDate = new Date(hireDateRaw);
    if (Number.isNaN(hireDate.getTime())) {
      return NextResponse.json({ error: "Invalid hire date." }, { status: 400 });
    }

    const cvUrl = typeof body.cvUrl === "string" && body.cvUrl.trim() ? body.cvUrl.trim() : null;
    const cvPublicId =
      typeof body.cvPublicId === "string" && body.cvPublicId.trim() ? body.cvPublicId.trim() : null;
    const photoUrl = typeof body.photoUrl === "string" && body.photoUrl.trim() ? body.photoUrl.trim() : null;
    const photoPublicId =
      typeof body.photoPublicId === "string" && body.photoPublicId.trim() ? body.photoPublicId.trim() : null;

    const salaryAmount = parseSalary(body.salaryAmount);

    const row = await prisma.staffMember.create({
      data: {
        name,
        phone,
        address,
        title,
        hireDate,
        workingDays: JSON.stringify(workingDays),
        workingHours,
        salaryAmount,
        cvUrl,
        cvPublicId,
        photoUrl,
        photoPublicId,
        createdById: auth.userId,
      },
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "hr.staff.create",
      module: "hr",
      resourceType: "StaffMember",
      resourceId: row.id,
      metadata: { name: row.name },
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("HR staff create error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
