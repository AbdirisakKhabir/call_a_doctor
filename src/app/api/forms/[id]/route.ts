import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { logAuditFromRequest } from "@/lib/audit-log";
import {
  fieldTypeNeedsOptions,
  isCustomFormFieldType,
  normalizeOptions,
} from "@/lib/custom-form-field-types";

type ParsedField = {
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  /** Option strings for choice fields; omit / null when not used */
  options: string[] | null;
};

function parseFields(raw: unknown): ParsedField[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return { error: "fields must be an array" };
  const out: ParsedField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid field entry" };
    const o = item as Record<string, unknown>;
    const fieldType = typeof o.fieldType === "string" ? o.fieldType : "";
    if (!isCustomFormFieldType(fieldType)) {
      return { error: `Invalid field type: ${fieldType || "(empty)"}` };
    }
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) return { error: "Each field needs a label" };

    let options: ParsedField["options"] = null;
    if (fieldTypeNeedsOptions(fieldType)) {
      const norm = normalizeOptions(o.options);
      if (!norm?.length) {
        return { error: `Field "${label}" needs at least one option` };
      }
      options = norm;
    }

    const placeholder =
      typeof o.placeholder === "string" && o.placeholder.trim() ? o.placeholder.trim() : null;
    const helpText = typeof o.helpText === "string" && o.helpText.trim() ? o.helpText.trim() : null;

    out.push({
      fieldType,
      label,
      placeholder,
      helpText,
      required: Boolean(o.required),
      options,
    });
  }
  return out;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const row = await prisma.customForm.findUnique({
      where: { id },
      include: {
        fields: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formsView = await userHasPermission(auth.userId, "forms.view");
    const chartAccess =
      (await userHasPermission(auth.userId, "patient_history.create")) ||
      (await userHasPermission(auth.userId, "patient_history.view"));

    if (!formsView && !(row.isPublished && chartAccess)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("Form get error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "forms.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.customForm.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    const data: {
      title?: string;
      description?: string | null;
      isPublished?: boolean;
    } = {};

    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      data.title = t;
    }
    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
    }
    if (typeof body.isPublished === "boolean") {
      data.isPublished = body.isPublished;
    }

    const fieldsResult = parseFields(body.fields);
    if ("error" in fieldsResult) {
      return NextResponse.json({ error: fieldsResult.error }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const formRow = await tx.customForm.update({
        where: { id },
        data,
      });

      if (body.fields !== undefined) {
        await tx.customFormField.deleteMany({ where: { formId: id } });
        if (fieldsResult.length > 0) {
          await tx.customFormField.createMany({
            data: fieldsResult.map((f, i) => ({
              formId: id,
              sortOrder: i,
              fieldType: f.fieldType,
              label: f.label,
              placeholder: f.placeholder,
              helpText: f.helpText,
              required: f.required,
              options: f.options ?? undefined,
            })),
          });
        }
      }

      return formRow;
    });

    const full = await prisma.customForm.findUnique({
      where: { id: updated.id },
      include: {
        fields: { orderBy: { sortOrder: "asc" } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "custom_form.update",
      module: "forms",
      resourceType: "CustomForm",
      resourceId: id,
      metadata: {
        title: full?.title,
        fieldsReplaced: body.fields !== undefined,
      },
    });

    return NextResponse.json(full);
  } catch (e) {
    console.error("Form patch error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await userHasPermission(auth.userId, "forms.delete"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.customForm.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.customForm.delete({ where: { id } });

    await logAuditFromRequest(req, {
      userId: auth.userId,
      action: "custom_form.delete",
      module: "forms",
      resourceType: "CustomForm",
      resourceId: id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Form delete error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
