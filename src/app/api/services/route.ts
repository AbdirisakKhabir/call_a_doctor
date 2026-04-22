import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";
import { normalizeServiceColor } from "@/lib/service-color";
import { userHasPermission } from "@/lib/permissions";
import { normalizeSaleUnitKey } from "@/lib/product-sale-units";

function normalizeProductCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = branchId ? { branchId: Number(branchId), isActive: true } : { isActive: true };
    const include = { branch: { select: { id: true, name: true } } };

    if (paginate) {
      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.service.count({ where }),
      ]);
      return NextResponse.json({ data: services, total, page, pageSize });
    }

    const services = await prisma.service.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(services);
  } catch (e) {
    console.error("Services list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { name, description, price, durationMinutes, branchId, color, initialDisposable, initialDisposables } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const normalizedColor =
      typeof color === "string" && color.trim() ? normalizeServiceColor(color.trim()) : null;
    if (typeof color === "string" && color.trim() && !normalizedColor) {
      return NextResponse.json({ error: "Color must be a valid hex value (e.g. #dbeafe)" }, { status: 400 });
    }

    const disposableRows: { productCode: string; unitsPerService: number; deductionUnitKey: string }[] = [];
    const rawList: unknown[] = [];
    if (Array.isArray(initialDisposables)) {
      rawList.push(...initialDisposables);
    } else if (initialDisposable != null && typeof initialDisposable === "object") {
      rawList.push(initialDisposable);
    }
    if (rawList.length > 0) {
      const canDisposable =
        (await userHasPermission(auth.userId, "appointments.create")) ||
        (await userHasPermission(auth.userId, "appointments.edit")) ||
        (await userHasPermission(auth.userId, "appointments.view"));
      if (!canDisposable) {
        return NextResponse.json(
          { error: "You do not have permission to add service disposables." },
          { status: 403 }
        );
      }
      const seenCodes = new Set<string>();
      for (let i = 0; i < rawList.length; i++) {
        const row = rawList[i];
        if (row == null || typeof row !== "object") {
          return NextResponse.json({ error: `Disposable ${i + 1}: invalid payload` }, { status: 400 });
        }
        const o = row as Record<string, unknown>;
        const productCode =
          typeof o.productCode === "string" ? normalizeProductCode(o.productCode) : "";
        const unitsPerService = Number(o.unitsPerService);
        const deductionUnitKey = normalizeSaleUnitKey(
          typeof o.deductionUnitKey === "string" ? o.deductionUnitKey : "base"
        );
        if (!productCode) {
          return NextResponse.json(
            { error: `Disposable ${i + 1}: product code is required` },
            { status: 400 }
          );
        }
        if (!Number.isFinite(unitsPerService) || unitsPerService <= 0) {
          return NextResponse.json(
            { error: `Disposable ${i + 1}: units per service must be a positive number` },
            { status: 400 }
          );
        }
        if (seenCodes.has(productCode)) {
          return NextResponse.json(
            { error: "Each product code can only appear once in the disposable list." },
            { status: 400 }
          );
        }
        seenCodes.add(productCode);
        disposableRows.push({ productCode, unitsPerService, deductionUnitKey });
      }
    }

    const service = await prisma.$transaction(async (tx) => {
      const created = await tx.service.create({
        data: {
          name: String(name).trim(),
          color: normalizedColor,
          description: description ? String(description).trim() : null,
          price: Math.max(0, Number(price) || 0),
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          branchId: branchId ? Number(branchId) : null,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
      for (const d of disposableRows) {
        await tx.serviceDisposable.create({
          data: {
            serviceId: created.id,
            productCode: d.productCode,
            unitsPerService: d.unitsPerService,
            deductionUnitKey: d.deductionUnitKey,
          },
        });
      }
      return created;
    });
    return NextResponse.json(service);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This product code is already linked to this service" },
        { status: 400 }
      );
    }
    console.error("Create service error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
