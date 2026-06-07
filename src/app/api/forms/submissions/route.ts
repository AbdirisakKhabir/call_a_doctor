import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { formatClientFullName } from "@/lib/patient-name";

/** Parse `YYYY-MM-DD` as local calendar day start (avoids UTC shift from `new Date(iso)`). */
function parseFilterDateStart(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseFilterDateEnd(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Report: paginated form submissions with filters. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "forms.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const formId = sp.get("formId") ? Number(sp.get("formId")) : null;
    const patientId = sp.get("patientId") ? Number(sp.get("patientId")) : null;
    const from = sp.get("from");
    const to = sp.get("to");
    const take = Math.min(Number(sp.get("take")) || 100, 500);
    const skip = Math.max(Number(sp.get("skip")) || 0, 0);

    const where: {
      formId?: number;
      patientId?: number;
      submittedAt?: { gte?: Date; lte?: Date };
    } = {};

    if (formId != null && Number.isInteger(formId) && formId > 0) where.formId = formId;
    if (patientId != null && Number.isInteger(patientId) && patientId > 0) where.patientId = patientId;

    if (from || to) {
      where.submittedAt = {};
      if (from) {
        const d = parseFilterDateStart(from);
        if (d) where.submittedAt.gte = d;
      }
      if (to) {
        const d = parseFilterDateEnd(to);
        if (d) where.submittedAt.lte = d;
      }
    }

    const [rows, total] = await Promise.all([
      prisma.customFormResponse.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        take,
        skip,
        include: {
          form: { select: { id: true, title: true } },
          patient: {
            select: {
              id: true,
              patientCode: true,
              firstName: true,
              lastName: true,
            },
          },
          appointment: {
            select: {
              id: true,
              appointmentDate: true,
              startTime: true,
              branch: { select: { name: true } },
            },
          },
          submittedBy: { select: { id: true, name: true, email: true } },
          answers: { orderBy: { id: "asc" } },
        },
      }),
      prisma.customFormResponse.count({ where }),
    ]);

    const data = rows.map((r) => ({
      ...r,
      patient: {
        ...r.patient,
        name: formatClientFullName(r.patient),
      },
    }));

    return NextResponse.json({ data, total, take, skip });
  } catch (e) {
    console.error("Form submissions report error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
