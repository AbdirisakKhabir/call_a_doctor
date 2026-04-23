import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "forms.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.customForm.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { fields: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Forms list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "forms.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const description =
      typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;

    const row = await prisma.customForm.create({
      data: {
        title,
        description,
        createdById: auth.userId,
      },
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "custom_form.create",
      module: "forms",
      resourceType: "CustomForm",
      resourceId: row.id,
      metadata: { title: row.title },
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("Create form error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
