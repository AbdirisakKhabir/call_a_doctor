import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import {
  decodeOptionsList,
  encodeFormAnswer,
  isAnswerEmpty,
  validateAnswerAgainstOptions,
} from "@/lib/custom-form-answer-encode";
import { fieldTypeNeedsOptions } from "@/lib/custom-form-field-types";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const canSubmit =
      (await userHasPermission(auth.userId, "patient_history.create")) ||
      (await userHasPermission(auth.userId, "forms.edit"));

    if (!canSubmit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formId = Number((await ctx.params).id);
    if (!Number.isInteger(formId) || formId < 1) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 });
    }

    const body = await req.json();
    const patientId = Number(body.patientId);
    if (!Number.isInteger(patientId) || patientId < 1) {
      return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
    }

    let appointmentId: number | null = null;
    if (body.appointmentId != null && body.appointmentId !== "") {
      const aid = Number(body.appointmentId);
      if (!Number.isInteger(aid) || aid < 1) {
        return NextResponse.json({ error: "Invalid appointment id" }, { status: 400 });
      }
      appointmentId = aid;
    }

    const answersRaw = body.answers;
    if (!answersRaw || typeof answersRaw !== "object" || Array.isArray(answersRaw)) {
      return NextResponse.json({ error: "answers must be an object" }, { status: 400 });
    }

    const form = await prisma.customForm.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    if (!form.isPublished && !(await userHasPermission(auth.userId, "forms.edit"))) {
      return NextResponse.json({ error: "This form is not published" }, { status: 403 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    if (appointmentId != null) {
      const appt = await prisma.appointment.findFirst({
        where: { id: appointmentId, patientId },
      });
      if (!appt) {
        return NextResponse.json({ error: "Booking not found for this client" }, { status: 400 });
      }
    }

    const answerRows: { fieldId: number; fieldLabel: string; fieldType: string; value: string }[] = [];

    for (const field of form.fields) {
      const key = String(field.id);
      const raw = (answersRaw as Record<string, unknown>)[key];
      const encoded = encodeFormAnswer(field.fieldType, raw);
      const empty = isAnswerEmpty(field.fieldType, encoded);

      if (field.required && empty) {
        return NextResponse.json({ error: `Required: ${field.label}` }, { status: 400 });
      }
      if (empty) continue;

      const opts = fieldTypeNeedsOptions(field.fieldType)
        ? decodeOptionsList(field.options)
        : [];
      if (opts.length > 0 && encoded != null && !validateAnswerAgainstOptions(field.fieldType, encoded, opts)) {
        return NextResponse.json({ error: `Invalid choice for: ${field.label}` }, { status: 400 });
      }

      answerRows.push({
        fieldId: field.id,
        fieldLabel: field.label,
        fieldType: field.fieldType,
        value: encoded!,
      });
    }

    const response = await prisma.customFormResponse.create({
      data: {
        formId: form.id,
        patientId,
        appointmentId,
        submittedById: auth.userId,
        answers: {
          create: answerRows,
        },
      },
      include: {
        answers: true,
        form: { select: { id: true, title: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
      },
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "custom_form.submit",
      module: "forms",
      resourceType: "CustomFormResponse",
      resourceId: response.id,
      metadata: { formId: form.id, patientId, appointmentId },
    });

    return NextResponse.json(response);
  } catch (e) {
    console.error("Form submission error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
