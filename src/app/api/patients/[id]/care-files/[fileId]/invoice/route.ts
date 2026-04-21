import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCareFileInvoicePayload } from "@/lib/care-file";

/** Same payload as GET /care-files/[fileId]; dedicated route for printing. */
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
    console.error("Care file invoice error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
