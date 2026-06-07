import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanTransactInventoryAtBranch } from "@/lib/branch-access";
import { userHasPermission } from "@/lib/permissions";
import { listPaginationFromSearchParams } from "@/lib/list-pagination";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const branchIdParam = searchParams.get("branchId");
    if (!branchIdParam) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    const bid = Number(branchIdParam);
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "Invalid branch id" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const activeOnly = searchParams.get("activeOnly") !== "false";
    const { paginate, page, pageSize, skip } = listPaginationFromSearchParams(searchParams);

    const where = { branchId: bid, ...(activeOnly ? { isActive: true } : {}) };
    const include = {
      members: true,
      inventory: {
        include: {
          product: { select: { id: true, name: true, code: true, sellingPrice: true, unit: true } },
        },
      },
    };

    if (paginate) {
      const [teams, total] = await Promise.all([
        prisma.outreachTeam.findMany({
          where,
          include,
          orderBy: { name: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.outreachTeam.count({ where }),
      ]);
      return NextResponse.json({ data: teams, total, page, pageSize });
    }

    const teams = await prisma.outreachTeam.findMany({
      where,
      include,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(teams);
  } catch (e) {
    console.error("Outreach teams list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (
      !(await userHasPermission(auth.userId, "pharmacy.edit")) &&
      !(await userHasPermission(auth.userId, "settings.manage"))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { branchId, name, phone, notes, members } = body;

    const bid = Number(branchId);
    if (!Number.isInteger(bid)) {
      return NextResponse.json({ error: "branchId is required" }, { status: 400 });
    }
    if (!(await userCanTransactInventoryAtBranch(auth.userId, bid))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const teamName = typeof name === "string" ? name.trim() : "";
    if (!teamName) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    const team = await prisma.outreachTeam.create({
      data: {
        branchId: bid,
        name: teamName,
        phone: phone ? String(phone).trim() : null,
        notes: notes ? String(notes).trim() : null,
        members:
          Array.isArray(members) && members.length > 0
            ? {
                create: members
                  .filter((m: { name?: string }) => m && typeof m.name === "string" && m.name.trim())
                  .map((m: { name: string; phone?: string; role?: string }) => ({
                    name: String(m.name).trim(),
                    phone: m.phone ? String(m.phone).trim() : null,
                    role: m.role ? String(m.role).trim() : null,
                  })),
              }
            : undefined,
      },
      include: { members: true },
    });

    return NextResponse.json(team);
  } catch (e) {
    console.error("Outreach team create error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
