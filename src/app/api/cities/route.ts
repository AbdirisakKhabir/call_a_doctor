import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const all = req.nextUrl.searchParams.get("all") === "true";
    const canManage = await userHasPermission(auth.userId, "settings.manage");

    if (all && canManage) {
      const rows = await prisma.city.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return NextResponse.json(rows);
    }

    const rows = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Cities list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, sortOrder } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const order =
      sortOrder != null && sortOrder !== "" ? Number(sortOrder) : 0;
    if (!Number.isFinite(order) || !Number.isInteger(order)) {
      return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    }

    const row = await prisma.city.create({
      data: { name: name.trim(), sortOrder: order },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "city.create",
      module: "settings",
      resourceType: "City",
      resourceId: row.id,
      metadata: { name: row.name },
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "That city name already exists" }, { status: 400 });
    }
    console.error("Create city error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
