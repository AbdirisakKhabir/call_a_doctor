import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import { deleteRaw, deleteImage } from "@/lib/cloudinary";
import { normalizeWorkingDays } from "@/lib/hr-staff";

function parseSalary(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "hr.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const row = await prisma.staffMember.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    console.error("HR staff get error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "hr.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.staffMember.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const patch: Prisma.StaffMemberUpdateInput = {};

    if (typeof body.name === "string") patch.name = body.name.trim();
    if (typeof body.phone === "string") patch.phone = body.phone.trim();
    if (typeof body.address === "string") patch.address = body.address.trim();
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.workingHours === "string") patch.workingHours = body.workingHours.trim();
    if (body.hireDate !== undefined) {
      const hireDateRaw = typeof body.hireDate === "string" ? body.hireDate.trim() : "";
      if (!hireDateRaw) return NextResponse.json({ error: "Hire date is required." }, { status: 400 });
      const hireDate = new Date(hireDateRaw);
      if (Number.isNaN(hireDate.getTime())) return NextResponse.json({ error: "Invalid hire date." }, { status: 400 });
      patch.hireDate = hireDate;
    }
    if (body.workingDays !== undefined) {
      const workingDays = normalizeWorkingDays(body.workingDays);
      if (workingDays.length === 0) {
        return NextResponse.json({ error: "Select at least one working day." }, { status: 400 });
      }
      patch.workingDays = JSON.stringify(workingDays);
    }
    if ("salaryAmount" in body) patch.salaryAmount = parseSalary(body.salaryAmount);
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

    if (body.cvUrl !== undefined) {
      const nextUrl = typeof body.cvUrl === "string" && body.cvUrl.trim() ? body.cvUrl.trim() : null;
      const nextPublicId =
        typeof body.cvPublicId === "string" && body.cvPublicId.trim() ? body.cvPublicId.trim() : null;
      if (existing.cvPublicId && existing.cvPublicId !== nextPublicId) {
        try {
          await deleteRaw(existing.cvPublicId);
        } catch {
          /* ignore cloudinary cleanup errors */
        }
      }
      patch.cvUrl = nextUrl;
      patch.cvPublicId = nextPublicId;
    }

    if (body.photoUrl !== undefined) {
      const nextUrl = typeof body.photoUrl === "string" && body.photoUrl.trim() ? body.photoUrl.trim() : null;
      const nextPublicId =
        typeof body.photoPublicId === "string" && body.photoPublicId.trim() ? body.photoPublicId.trim() : null;
      if (existing.photoPublicId && existing.photoPublicId !== nextPublicId) {
        try {
          await deleteImage(existing.photoPublicId);
        } catch {
          /* ignore */
        }
      }
      patch.photoUrl = nextUrl;
      patch.photoPublicId = nextPublicId;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No changes." }, { status: 400 });
    }

    const row = await prisma.staffMember.update({
      where: { id },
      data: patch,
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "hr.staff.update",
      module: "hr",
      resourceType: "StaffMember",
      resourceId: id,
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("HR staff patch error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "hr.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.staffMember.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (existing.cvPublicId) {
      try {
        await deleteRaw(existing.cvPublicId);
      } catch {
        /* ignore */
      }
    }
    if (existing.photoPublicId) {
      try {
        await deleteImage(existing.photoPublicId);
      } catch {
        /* ignore */
      }
    }

    await prisma.staffMember.delete({ where: { id } });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "hr.staff.delete",
      module: "hr",
      resourceType: "StaffMember",
      resourceId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("HR staff delete error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
