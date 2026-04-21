import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";

const ALLOWED = new Set([15, 30]);

async function getOrCreateSettings() {
  let row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.appSettings.create({
      data: {
        id: 1,
        expirySoonMode: "days",
        expirySoonDays: 10,
        expirySoonMonths: 1,
        appointmentCalendarSlotMinutes: 15,
      },
    });
  }
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "appointments.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const row = await getOrCreateSettings();
    const slotMinutes = ALLOWED.has(row.appointmentCalendarSlotMinutes)
      ? row.appointmentCalendarSlotMinutes
      : 15;
    return NextResponse.json({ slotMinutes });
  } catch (e) {
    console.error("GET appointment-calendar settings:", e);
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
    const raw = Number(body.slotMinutes);
    const slotMinutes = Math.floor(raw);
    if (!ALLOWED.has(slotMinutes)) {
      return NextResponse.json({ error: "slotMinutes must be 15 or 30." }, { status: 400 });
    }

    const row = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        expirySoonMode: "days",
        expirySoonDays: 10,
        expirySoonMonths: 1,
        appointmentCalendarSlotMinutes: slotMinutes,
      },
      update: { appointmentCalendarSlotMinutes: slotMinutes },
    });
    return NextResponse.json({ slotMinutes: row.appointmentCalendarSlotMinutes });
  } catch (e) {
    console.error("PUT appointment-calendar settings:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
