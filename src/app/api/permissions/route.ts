import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(permissions);
  } catch (e) {
    console.error("Permissions list error:", e);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
