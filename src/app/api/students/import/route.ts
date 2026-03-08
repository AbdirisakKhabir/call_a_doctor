import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

function findCol(headerRow: string[], patterns: RegExp[]): number {
  for (const p of patterns) {
    const idx = headerRow.findIndex((h) => p.test(String(h).trim()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as (string | number)[][];

    if (!data || data.length < 2) {
      return NextResponse.json(
        { error: "Excel file must have a header row and at least one student row" },
        { status: 400 }
      );
    }

    const headerRow = (data[0] as string[]).map((h) => String(h ?? "").trim());

    const studentIdIdx = findCol(headerRow, [
      /^student\s*id$/i,
      /^studentid$/i,
      /^id\s*card$/i,
    ]);
    const fullNameIdx = findCol(headerRow, [/^full\s*name$/i, /^fullname$/i]);
    const firstNameIdx = findCol(headerRow, [/^first\s*name$/i, /^firstname$/i]);
    const lastNameIdx = findCol(headerRow, [/^last\s*name$/i, /^lastname$/i]);

    const hasFullName = fullNameIdx >= 0;
    const hasFirstLast = firstNameIdx >= 0 && lastNameIdx >= 0;
    if (!hasFullName && !hasFirstLast) {
      return NextResponse.json(
        { error: "Excel must contain 'Full Name' or both 'First Name' and 'Last Name' columns" },
        { status: 400 }
      );
    }

    const motherNameIdx = findCol(headerRow, [/^mother\s*name$/i, /^mothername$/i]);
    const parentPhoneIdx = findCol(headerRow, [/^parent\s*phone$/i, /^parentphone$/i]);
    const emailIdx = findCol(headerRow, [/^email$/i]);
    const phoneIdx = findCol(headerRow, [/^phone$/i]);
    const dobIdx = findCol(headerRow, [/^date\s*of\s*birth$/i, /^dob$/i, /^birth/i]);
    const genderIdx = findCol(headerRow, [/^gender$/i]);
    const addressIdx = findCol(headerRow, [/^address$/i]);
    const deptCodeIdx = findCol(headerRow, [/^department\s*code$/i, /^department$/i, /^dept/i]);
    const programIdx = findCol(headerRow, [/^program$/i]);
    const statusIdx = findCol(headerRow, [/^status$/i]);
    const paymentStatusIdx = findCol(headerRow, [/^payment\s*status$/i, /^paymentstatus$/i]);

    const departments = await prisma.department.findMany({
      select: { id: true, code: true, tuitionFee: true },
    });
    const deptByCode = Object.fromEntries(
      departments.map((d) => [d.code.toUpperCase(), d])
    );

    const year = new Date().getFullYear();
    const prefix = `STD-${year}-`;
    const lastStudent = await prisma.student.findFirst({
      where: { studentId: { startsWith: prefix } },
      orderBy: { studentId: "desc" },
    });
    let nextNum = 1;
    if (lastStudent) {
      const lastNum = parseInt(lastStudent.studentId.split("-").pop() || "0", 10);
      nextNum = lastNum + 1;
    }

    const created: number[] = [];
    const errors: string[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as (string | number)[];
      if (!row || row.length === 0) continue;

      let firstName: string;
      let lastName: string;
      if (hasFullName) {
        const fullName = String(row[fullNameIdx] ?? "").trim();
        if (!fullName) {
          errors.push(`Row ${i + 1}: Full name is required`);
          continue;
        }
        const parts = fullName.split(/\s+/);
        firstName = parts[0] ?? "";
        lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      } else {
        firstName = String(row[firstNameIdx] ?? "").trim();
        lastName = String(row[lastNameIdx] ?? "").trim();
        if (!firstName || !lastName) {
          errors.push(`Row ${i + 1}: First name and last name are required`);
          continue;
        }
      }

      let studentId: string;
      const providedRaw = studentIdIdx >= 0 ? row[studentIdIdx] : undefined;
      const provided = String(providedRaw ?? "").trim();
      const hasProvidedId = provided.length > 0 && !/^0+$/.test(provided);
      if (hasProvidedId) {
        const existing = await prisma.student.findUnique({
          where: { studentId: provided },
        });
        if (existing) {
          errors.push(`Row ${i + 1}: Student ID "${provided}" already exists`);
          continue;
        }
        studentId = provided;
      } else {
        studentId = `${prefix}${String(nextNum++).padStart(4, "0")}`;
      }

      const deptCode = deptCodeIdx >= 0 ? String(row[deptCodeIdx] ?? "").trim().toUpperCase() : "";
      const dept = deptCode ? deptByCode[deptCode] : departments[0];
      const departmentId = dept?.id;
      if (!departmentId) {
        errors.push(`Row ${i + 1}: Invalid or missing department code "${deptCode}"`);
        continue;
      }

      const emailVal = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim().toLowerCase() : null;
      if (emailVal) {
        const existing = await prisma.student.findUnique({
          where: { email: emailVal },
        });
        if (existing) {
          errors.push(`Row ${i + 1}: Email "${emailVal}" already exists`);
          continue;
        }
      }

      const dateOfBirth = dobIdx >= 0 && row[dobIdx]
        ? parseDate(String(row[dobIdx]))
        : null;
      const status = statusIdx >= 0 ? String(row[statusIdx] ?? "Admitted").trim() || "Admitted" : "Admitted";
      const paymentStatusRaw = paymentStatusIdx >= 0 ? String(row[paymentStatusIdx] ?? "Fully Paid").trim() : "Fully Paid";
      const paymentStatus = ["Full Scholarship", "Half Scholar", "Fully Paid"].includes(paymentStatusRaw)
        ? paymentStatusRaw
        : "Fully Paid";

      const tuitionFee = dept?.tuitionFee ?? 0;
      const initialBalance =
        paymentStatus === "Full Scholarship" ? 0
        : paymentStatus === "Half Scholar" ? tuitionFee * 0.5
        : tuitionFee;

      const student = await prisma.student.create({
        data: {
          studentId,
          firstName,
          lastName,
          motherName: motherNameIdx >= 0 ? String(row[motherNameIdx] ?? "").trim() || null : null,
          parentPhone: parentPhoneIdx >= 0 ? String(row[parentPhoneIdx] ?? "").trim() || null : null,
          email: emailVal,
          phone: phoneIdx >= 0 ? String(row[phoneIdx] ?? "").trim() || null : null,
          dateOfBirth,
          gender: genderIdx >= 0 ? String(row[genderIdx] ?? "").trim() || null : null,
          address: addressIdx >= 0 ? String(row[addressIdx] ?? "").trim() || null : null,
          departmentId,
          program: programIdx >= 0 ? String(row[programIdx] ?? "").trim() || null : null,
          status: ["Pending", "Admitted", "Rejected", "Graduated"].includes(status) ? status : "Admitted",
          paymentStatus,
          balance: initialBalance,
        },
      });
      created.push(student.id);
    }

    return NextResponse.json({
      created: created.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Student import error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
