import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Lab inventory line + packaging units for a branch + product code (e.g. test disposable unit picker). */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchId = Number(searchParams.get("branchId"));
    const codeRaw = (searchParams.get("code") || "").trim();
    const code = normalizeCode(codeRaw);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const item = await prisma.labInventoryItem.findFirst({
      where: { branchId, code, isActive: true },
      include: { labUnits: { orderBy: { sortOrder: "asc" } } },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Lab inventory by-code GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
