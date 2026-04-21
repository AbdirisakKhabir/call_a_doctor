import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { enrichLabItemsWithProductImages } from "@/lib/lab-inventory-product-image";
import { userCanAccessBranch } from "@/lib/branch-access";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const branchIdRaw = searchParams.get("branchId");
    const search = (searchParams.get("search") || "").trim();
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);
    const bid = branchIdRaw ? Number(branchIdRaw) : NaN;
    if (!Number.isInteger(bid) || bid <= 0) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }

    const where: Prisma.LabInventoryItemWhereInput = {
      branchId: bid,
      isActive: true,
    };
    if (search.length >= 1) {
      const q = search;
      where.OR = [
        { code: { contains: q } },
        { name: { contains: q } },
      ];
    }

    const orderBy: Prisma.LabInventoryItemOrderByWithRelationInput[] = [{ name: "asc" }, { code: "asc" }];
    const unitInclude = {
      labUnits: { orderBy: { sortOrder: "asc" as const } },
    };

    if (paginate) {
      const [raw, total] = await Promise.all([
        prisma.labInventoryItem.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          include: unitInclude,
        }),
        prisma.labInventoryItem.count({ where }),
      ]);
      const data = await enrichLabItemsWithProductImages(bid, raw);
      return NextResponse.json({ data, total, page, pageSize });
    }

    const rows = await prisma.labInventoryItem.findMany({
      where,
      orderBy,
      take: search ? 100 : 500,
      include: unitInclude,
    });
    const withImages = await enrichLabItemsWithProductImages(bid, rows);
    return NextResponse.json(withImages);
  } catch (e) {
    console.error("Lab inventory GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "lab.create")) && !(await userHasPermission(auth.userId, "lab.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const branchId = Number(body.branchId);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
    const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "pcs";
    const sellingPrice = body.sellingPrice != null ? Math.max(0, Number(body.sellingPrice)) : 0;
    const initialQty = body.initialQuantity != null ? Math.max(0, Math.floor(Number(body.initialQuantity))) : 0;

    if (!Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "Valid branchId is required" }, { status: 400 });
    }
    if (!name || !code) {
      return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
    }

    if (!(await userCanAccessBranch(auth.userId, branchId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.labInventoryItem.create({
        data: {
          branchId,
          name,
          code,
          unit,
          quantity: initialQty,
          sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0,
        },
      });
      await tx.labInventoryUnit.create({
        data: {
          labInventoryItemId: row.id,
          unitKey: "base",
          label: unit.slice(0, 191),
          baseUnitsEach: 1,
          sortOrder: 0,
        },
      });
      if (initialQty > 0) {
        await tx.labStockMovement.create({
          data: {
            labInventoryItemId: row.id,
            branchId,
            signedQuantity: initialQty,
            reason: "receive",
            notes: "Opening / initial stock",
            createdById: auth.userId,
          },
        });
      }
      return tx.labInventoryItem.findUniqueOrThrow({
        where: { id: row.id },
        include: { labUnits: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json(created);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "An item with this code already exists at this branch" }, { status: 400 });
    }
    console.error("Lab inventory POST error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
