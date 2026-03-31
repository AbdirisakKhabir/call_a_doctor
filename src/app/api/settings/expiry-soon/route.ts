import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

function toPayload(row: {
  expirySoonMode: string;
  expirySoonDays: number;
  expirySoonMonths: number;
}) {
  return {
    mode: row.expirySoonMode === "months" ? "months" : "days",
    days: row.expirySoonDays,
    months: row.expirySoonMonths,
  };
}

async function getOrCreateSettings() {
  let row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.appSettings.create({
      data: {
        id: 1,
        expirySoonMode: "days",
        expirySoonDays: 10,
        expirySoonMonths: 1,
      },
    });
  }
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const row = await getOrCreateSettings();
    return NextResponse.json(toPayload(row));
  } catch (e) {
    console.error("GET expiry-soon settings:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "settings.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const mode = body.mode === "months" ? "months" : "days";
    const days = Math.floor(Number(body.days));
    const months = Math.floor(Number(body.months));

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "Days must be between 1 and 365." }, { status: 400 });
    }
    if (!Number.isFinite(months) || months < 1 || months > 24) {
      return NextResponse.json({ error: "Months must be between 1 and 24." }, { status: 400 });
    }

    const row = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        expirySoonMode: mode,
        expirySoonDays: days,
        expirySoonMonths: months,
      },
      update: {
        expirySoonMode: mode,
        expirySoonDays: days,
        expirySoonMonths: months,
      },
    });
    return NextResponse.json(toPayload(row));
  } catch (e) {
    console.error("PUT expiry-soon settings:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
