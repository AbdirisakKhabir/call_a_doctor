import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveBranchAccess } from "@/lib/pharmacy-branch";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resolved = await requireActiveBranchAccess(auth.userId, searchParams.get("branchId"));
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = { branchId };

    if (paginate) {
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.supplier.count({ where }),
      ]);
      return NextResponse.json({ data: suppliers, total, page, pageSize });
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(suppliers);
  } catch (e) {
    console.error("Suppliers list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, contactPerson, email, phone, address, branchId: bodyBranchId } = body;

    const resolved = await requireActiveBranchAccess(auth.userId, bodyBranchId);
    if (resolved instanceof NextResponse) return resolved;
    const { branchId } = resolved;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        branchId,
        name: String(name).trim(),
        contactPerson: contactPerson ? String(contactPerson).trim() : null,
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
      },
    });
    return NextResponse.json(supplier);
  } catch (e) {
    console.error("Create supplier error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
