import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePatient } from "@/lib/patient-name";
import { buildCareFileInvoicePayload, closeOpenCareFilesAndCreateNew } from "@/lib/care-file";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, patientCode: true, firstName: true, lastName: true },
    });
    if (!patient) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const files = await prisma.patientCareFile.findMany({
      where: {
        patientId,
        ...(status && ["open", "closed"].includes(status) ? { status } : {}),
      },
      orderBy: { openedAt: "desc" },
    });

    const rows = await Promise.all(
      files.map(async (f) => {
        const inv = await buildCareFileInvoicePayload(prisma, f.id);
        if (!inv) return null;
        return {
          ...inv.file,
          openedAt: inv.file.openedAt,
          totals: inv.totals,
        };
      })
    );

    return NextResponse.json({
      patient: serializePatient(patient),
      files: rows.filter(Boolean),
    });
  } catch (e) {
    console.error("Care files list error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** Starts a new client file (closes any other open file for this patient). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const patientId = Number(id);
    if (!Number.isInteger(patientId)) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const title =
      body && typeof body.title === "string" && body.title.trim() ? String(body.title).trim() : null;

    const file = await prisma.$transaction((tx) => closeOpenCareFilesAndCreateNew(tx, patientId, title));

    return NextResponse.json(file);
  } catch (e) {
    console.error("Care file create error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
