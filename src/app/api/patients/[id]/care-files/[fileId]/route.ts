import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CARE_FILE_STATUS_CLOSED, CARE_FILE_STATUS_OPEN, buildCareFileInvoicePayload } from "@/lib/care-file";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, fileId } = await params;
    const patientId = Number(id);
    const cfId = Number(fileId);
    if (!Number.isInteger(patientId) || !Number.isInteger(cfId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const file = await prisma.patientCareFile.findFirst({
      where: { id: cfId, patientId },
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payload = await buildCareFileInvoicePayload(prisma, cfId);
    if (!payload) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(payload);
  } catch (e) {
    console.error("Care file GET error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, fileId } = await params;
    const patientId = Number(id);
    const cfId = Number(fileId);
    if (!Number.isInteger(patientId) || !Number.isInteger(cfId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.patientCareFile.findFirst({
      where: { id: cfId, patientId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const data: {
      title?: string | null;
      notes?: string | null;
      status?: string;
      closedAt?: Date | null;
      invoicedAt?: Date | null;
    } = {};

    if (typeof body.title === "string") data.title = body.title.trim() || null;
    if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

    if (typeof body.status === "string") {
      if (body.status === CARE_FILE_STATUS_CLOSED) {
        data.status = CARE_FILE_STATUS_CLOSED;
        data.closedAt = existing.closedAt ?? new Date();
      } else if (body.status === CARE_FILE_STATUS_OPEN) {
        data.status = CARE_FILE_STATUS_OPEN;
        data.closedAt = null;
      }
    }

    if (body.invoiced === true || body.markInvoiced === true) {
      data.invoicedAt = new Date();
    }
    if (body.invoicedAt != null && body.invoicedAt !== "") {
      data.invoicedAt = new Date(String(body.invoicedAt));
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }

    const updated = await prisma.patientCareFile.update({
      where: { id: cfId },
      data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("Care file PATCH error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
