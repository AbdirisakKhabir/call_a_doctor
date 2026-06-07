import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { assertLabTestParentAssignment } from "@/lib/lab-test-parent";

type ItemIn = {
  name?: unknown;
  code?: unknown;
  unit?: unknown;
  normalRange?: unknown;
};

/** Batch-create sub-tests under a top-level panel test. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const panelId = Number(id);
    if (!Number.isInteger(panelId) || panelId <= 0) {
      return NextResponse.json({ error: "Invalid panel id" }, { status: 400 });
    }
    const body = await req.json();
    const rawItems = body?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ error: "Provide a non-empty items array" }, { status: 400 });
    }
    if (rawItems.length > 60) {
      return NextResponse.json({ error: "Too many rows (max 60 per request)" }, { status: 400 });
    }

    const parsed: Array<{
      name: string;
      code: string | null;
      unit: string | null;
      normalRange: string | null;
    }> = [];

    for (const row of rawItems) {
      if (!row || typeof row !== "object") continue;
      const r = row as ItemIn;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      const code = typeof r.code === "string" && r.code.trim() ? String(r.code).trim() : null;
      const unit = typeof r.unit === "string" && r.unit.trim() ? String(r.unit).trim() : null;
      const normalRange =
        typeof r.normalRange === "string" && r.normalRange.trim() ? String(r.normalRange).trim() : null;
      parsed.push({ name, code, unit, normalRange });
    }

    if (parsed.length === 0) {
      return NextResponse.json({ error: "Add at least one sub-test with a name" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const panel = await tx.labTest.findUnique({
        where: { id: panelId },
        select: { id: true, parentTestId: true, categoryId: true },
      });
      if (!panel) {
        throw new Error("NOT_FOUND");
      }
      if (panel.parentTestId != null) {
        throw new Error("BAD_REQUEST:Only a top-level test can own sub-tests.");
      }
      const parentErr = await assertLabTestParentAssignment(tx, { parentTestId: panelId });
      if (parentErr) {
        throw new Error(`BAD_REQUEST:${parentErr}`);
      }

      for (const item of parsed) {
        await tx.labTest.create({
          data: {
            categoryId: panel.categoryId,
            parentTestId: panel.id,
            name: item.name,
            code: item.code,
            unit: item.unit,
            normalRange: item.normalRange,
            price: 0,
          },
        });
      }

      return tx.labTest.findUniqueOrThrow({
        where: { id: panelId },
        include: {
          category: { select: { id: true, name: true } },
          subtests: {
            where: { isActive: true },
            select: { id: true, name: true, code: true, unit: true, normalRange: true },
            orderBy: { name: "asc" },
          },
          parentTest: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json({ createdCount: parsed.length, panel: created });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Panel test not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    console.error("Batch sub-tests error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
