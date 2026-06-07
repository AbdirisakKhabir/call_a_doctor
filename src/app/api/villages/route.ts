import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cityIdParam = req.nextUrl.searchParams.get("cityId");
    const all = req.nextUrl.searchParams.get("all") === "true";
    const canManage = await userHasPermission(auth.userId, "settings.manage");

    if (!cityIdParam || !Number.isInteger(Number(cityIdParam))) {
      return NextResponse.json({ error: "cityId is required" }, { status: 400 });
    }
    const cityId = Number(cityIdParam);

    if (all && canManage) {
      const rows = await prisma.village.findMany({
        where: { cityId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return NextResponse.json(rows);
    }

    const rows = await prisma.village.findMany({
      where: { cityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("Villages list error:", e);
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
    const { cityId, name, sortOrder } = body;
    const cid = Number(cityId);
    if (!Number.isInteger(cid)) {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const order = sortOrder != null && sortOrder !== "" ? Number(sortOrder) : 0;
    if (!Number.isFinite(order) || !Number.isInteger(order)) {
      return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    }

    const city = await prisma.city.findFirst({ where: { id: cid, isActive: true } });
    if (!city) {
      return NextResponse.json({ error: "Invalid or inactive city" }, { status: 400 });
    }

    const row = await prisma.village.create({
      data: { cityId: cid, name: name.trim(), sortOrder: order },
    });
    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "village.create",
      module: "settings",
      resourceType: "Village",
      resourceId: row.id,
      metadata: { name: row.name, cityId: cid },
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "That village name already exists in this city" }, { status: 400 });
    }
    console.error("Create village error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
