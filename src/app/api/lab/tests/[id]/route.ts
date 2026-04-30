import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { assertLabTestParentAssignment } from "@/lib/lab-test-parent";

const testDetailInclude = {
  category: { select: { id: true, name: true } },
  subtests: {
    where: { isActive: true },
    select: { id: true, name: true, code: true, unit: true, normalRange: true },
    orderBy: { name: "asc" as const },
  },
  parentTest: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const test = await prisma.labTest.findUnique({
      where: { id: parsedId },
      include: testDetailInclude,
    });
    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(test);
  } catch (e) {
    console.error("Get lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const body = await req.json();
    const { categoryId, name, code, unit, normalRange, isActive, price, parentTestId: parentTestIdBody } = body;

    const test = await prisma.$transaction(async (tx) => {
      const existing = await tx.labTest.findUnique({
        where: { id: parsedId },
        select: { parentTestId: true },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      let nextParentId: number | null | undefined = undefined;
      if (typeof parentTestIdBody !== "undefined") {
        if (parentTestIdBody === null || parentTestIdBody === "") {
          nextParentId = null;
        } else {
          const n = Number(parentTestIdBody);
          if (!Number.isInteger(n) || n <= 0) {
            throw new Error("BAD_REQUEST:Invalid parent panel test");
          }
          nextParentId = n;
        }
      }

      if (typeof nextParentId !== "undefined") {
        const parentErr = await assertLabTestParentAssignment(tx, {
          testId: parsedId,
          parentTestId: nextParentId,
        });
        if (parentErr) {
          throw new Error(`BAD_REQUEST:${parentErr}`);
        }
      }

      const effectiveParentId =
        typeof nextParentId !== "undefined" ? nextParentId : existing.parentTestId;
      const isSubTest = effectiveParentId != null;

      const data: Record<string, unknown> = {};
      if (categoryId != null) data.categoryId = Number(categoryId);
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof code !== "undefined") data.code = code ? String(code).trim() : null;
      if (typeof unit !== "undefined") data.unit = unit ? String(unit).trim() : null;
      if (typeof normalRange !== "undefined") data.normalRange = normalRange ? String(normalRange).trim() : null;
      if (typeof isActive === "boolean") data.isActive = isActive;

      if (isSubTest) {
        data.price = 0;
      } else if (typeof price !== "undefined") {
        const p = Math.max(0, Number(price));
        data.price = Number.isFinite(p) ? p : 0;
      }

      if (typeof nextParentId !== "undefined") {
        data.parentTestId = nextParentId;
      }

      await tx.labTest.update({ where: { id: parsedId }, data });
      return tx.labTest.findUniqueOrThrow({
        where: { id: parsedId },
        include: testDetailInclude,
      });
    });

    return NextResponse.json(test);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message.startsWith("BAD_REQUEST:")) {
      return NextResponse.json({ error: e.message.replace(/^BAD_REQUEST:/, "").trim() }, { status: 400 });
    }
    console.error("Update lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsedId = Number(id);
    if (!Number.isInteger(parsedId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const childCount = await prisma.labTest.count({ where: { parentTestId: parsedId } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: "Remove or reassign sub-tests before deleting this panel test." },
        { status: 400 }
      );
    }
    await prisma.labTest.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete lab test error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
