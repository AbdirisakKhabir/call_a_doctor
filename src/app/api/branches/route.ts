import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAllowedBranchIds } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const all = searchParams.get("all") === "true";
    const canManage = await userHasPermission(auth.userId, "settings.manage");
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    if (all && canManage) {
      if (paginate) {
        const [branches, total] = await Promise.all([
          prisma.branch.findMany({ orderBy: { name: "asc" }, skip, take: pageSize }),
          prisma.branch.count(),
        ]);
        return NextResponse.json({ data: branches, total, page, pageSize });
      }
      const branches = await prisma.branch.findMany({
        orderBy: { name: "asc" },
      });
      return NextResponse.json(branches);
    }

    const allowed = await getUserAllowedBranchIds(auth.userId);
    const where = {
      isActive: true,
      ...(allowed ? { id: { in: allowed } } : {}),
    };
    if (paginate) {
      const [branches, total] = await Promise.all([
        prisma.branch.findMany({ where, orderBy: { name: "asc" }, skip, take: pageSize }),
        prisma.branch.count({ where }),
      ]);
      return NextResponse.json({ data: branches, total, page, pageSize });
    }

    const branches = await prisma.branch.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(branches);
  } catch (e) {
    console.error("Branches list error:", e);
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
    const { name, address, phone, email } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const branch = await prisma.branch.create({
      data: {
        name: String(name).trim(),
        address: address ? String(address).trim() : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
      },
    });
    return NextResponse.json(branch);
  } catch (e) {
    console.error("Create branch error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
