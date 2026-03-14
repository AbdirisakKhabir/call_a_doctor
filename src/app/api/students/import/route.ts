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

/** Get or create department by code; auto-creates if missing (for ACC, ICT, HRM, LAB, SWE, etc.) */
async function getOrCreateDepartment(
  code: string,
  deptByCode: Record<string, { id: number; code: string; tuitionFee: number | null }>,
  departments: { id: number; code: string; tuitionFee: number | null }[]
): Promise<{ id: number; tuitionFee: number | null } | null> {
  const upper = code.toUpperCase();
  const existing = deptByCode[upper];
  if (existing) return existing;

  // Auto-create department if code is valid (e.g. ACC, ICT, HRM, LAB, SWE)
  const deptNames: Record<string, string> = {
    ACC: "Accounting",
    ICT: "Information and Communication Technology",
    HRM: "Human Resource Management",
    LAB: "Laboratory Science",
    SWE: "Software Engineering",
    CS: "Computer Science",
    IT: "Information Technology",
  };
  const name = deptNames[upper] ?? `${upper} Department`;

  const faculty = await prisma.faculty.findFirst({ orderBy: { id: "asc" } });
  if (!faculty) return null;

  const created = await prisma.department.create({
    data: { code: upper, name, facultyId: faculty.id, tuitionFee: 0 },
    select: { id: true, tuitionFee: true },
  });
  deptByCode[upper] = { id: created.id, code: upper, tuitionFee: created.tuitionFee };
  departments.push(deptByCode[upper]);
  return created;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const departmentIdStr = formData.get("departmentId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    const selectedDepartmentId = departmentIdStr ? Number(departmentIdStr) : NaN;
    const useSelectedDept = Number.isInteger(selectedDepartmentId) && selectedDepartmentId > 0;
    if (!useSelectedDept) {
      return NextResponse.json(
        { error: "Please select a department for the import" },
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

    // Try row 0 as headers; if no name column found, try row 1 (some files have a title row)
    let headerRow = (data[0] as string[]).map((h) => String(h ?? "").trim());
    let dataStartRow = 1;
    const hasNameCol = (row: string[]) =>
      findCol(row, [/^full\s*name$/i, /^fullname$/i, /^name$/i, /^student\s*name$/i]) >= 0 ||
      (findCol(row, [/^first\s*name$/i]) >= 0 && findCol(row, [/^last\s*name$/i]) >= 0);
    if (!hasNameCol(headerRow) && data.length > 2) {
      const row1 = (data[1] as string[]).map((h) => String(h ?? "").trim());
      if (hasNameCol(row1)) {
        headerRow = row1;
        dataStartRow = 2;
      }
    }

    const studentIdIdx = findCol(headerRow, [
      /^student\s*id$/i,
      /^studentid$/i,
      /^id\s*card$/i,
      /^id\s*card\s*no/i,
      /^registration\s*(no|number)$/i,
      /^reg\s*no$/i,
      /^student\s*no$/i,
      /^id$/i,
    ]);
    const fullNameIdx = findCol(headerRow, [
      /^full\s*name$/i,
      /^fullname$/i,
      /^name$/i,
      /^student\s*name$/i,
    ]);
    const firstNameIdx = findCol(headerRow, [/^first\s*name$/i, /^firstname$/i]);
    const lastNameIdx = findCol(headerRow, [/^last\s*name$/i, /^lastname$/i]);

    const hasFullName = fullNameIdx >= 0;
    const hasFirstLast = firstNameIdx >= 0 && lastNameIdx >= 0;
    // Fallback: use column index 1 as Full Name when template order is Student ID, Full Name, ...
    const fallbackNameIdx = !hasFullName && !hasFirstLast && headerRow.length > 1 ? 1 : -1;
    if (!hasFullName && !hasFirstLast && fallbackNameIdx < 0) {
      return NextResponse.json(
        { error: "Excel must contain a name column (e.g. 'Full Name', 'Name', or 'First Name' + 'Last Name')" },
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
    const deptCodeIdx = findCol(headerRow, [
      /^department\s*code$/i,
      /^department$/i,
      /^dept\s*code$/i,
      /^dept$/i,
      /^department\s*name$/i,
    ]);
    const programIdx = findCol(headerRow, [/^program$/i]);
    const statusIdx = findCol(headerRow, [/^status$/i]);
    const paymentStatusIdx = findCol(headerRow, [/^payment\s*status$/i, /^paymentstatus$/i]);

    const departments = await prisma.department.findMany({
      select: { id: true, code: true, tuitionFee: true },
    });
    const deptByCode: Record<string, { id: number; code: string; tuitionFee: number | null }> =
      Object.fromEntries(departments.map((d) => [d.code.toUpperCase(), { ...d }]));

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

    for (let i = dataStartRow; i < data.length; i++) {
      const row = data[i] as (string | number)[];
      if (!row || row.length === 0) continue;

      let firstName: string;
      let lastName: string;
      if (hasFullName) {
        const fullName = String(row[fullNameIdx] ?? "").trim();
        if (!fullName) {
          errors.push(`Row ${i + 1}: Name is required`);
          continue;
        }
        const parts = fullName.split(/\s+/).filter(Boolean);
        firstName = parts[0] ?? "";
        lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      } else if (hasFirstLast) {
        firstName = String(row[firstNameIdx] ?? "").trim();
        lastName = String(row[lastNameIdx] ?? "").trim();
        if (!firstName || !lastName) {
          errors.push(`Row ${i + 1}: First name and last name are required`);
          continue;
        }
      } else {
        const fullName = String(row[fallbackNameIdx] ?? "").trim();
        if (!fullName) {
          errors.push(`Row ${i + 1}: Name is required`);
          continue;
        }
        const parts = fullName.split(/\s+/).filter(Boolean);
        firstName = parts[0] ?? "";
        lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
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

      let departmentId: number;
      if (useSelectedDept) {
        const dept = departments.find((d) => d.id === selectedDepartmentId);
        if (!dept) {
          errors.push(`Row ${i + 1}: Selected department not found`);
          continue;
        }
        departmentId = dept.id;
      } else {
        const deptCode = deptCodeIdx >= 0 ? String(row[deptCodeIdx] ?? "").trim().toUpperCase() : "";
        let dept: { id: number; tuitionFee: number | null } | null = deptCode
          ? deptByCode[deptCode] ?? null
          : departments[0] ?? null;
        if (!dept && deptCode) {
          dept = await getOrCreateDepartment(deptCode, deptByCode, departments);
        }
        if (!dept) {
          dept = departments[0] ?? null;
        }
        if (!dept?.id) {
          errors.push(
            `Row ${i + 1}: No department found. Select a department above or add Department Code column.`
          );
          continue;
        }
        departmentId = dept.id;
      }
      const dept = departments.find((d) => d.id === departmentId) ?? Object.values(deptByCode).find((d) => d.id === departmentId);

      const emailRaw = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim().toLowerCase() : "";
      const emailVal = emailRaw || null; // Use null for empty - DB unique constraint rejects multiple ""
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
      const paymentStatusMap: Record<string, string> = {
        "full scholarship": "Full Scholarship",
        "half scholar": "Half Scholar",
        "fully paid": "Fully Paid",
        paid: "Fully Paid",
        unpaid: "Fully Paid",
        half: "Half Scholar",
        full: "Full Scholarship",
      };
      const paymentStatus =
        paymentStatusMap[paymentStatusRaw.toLowerCase()] ??
        (["Full Scholarship", "Half Scholar", "Fully Paid"].includes(paymentStatusRaw) ? paymentStatusRaw : "Fully Paid");

      const tuitionFee = (dept ?? departments.find((d) => d.id === departmentId))?.tuitionFee ?? 0;
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
    const err = e as Error & { code?: string; meta?: { target?: string[] } };
    if (err.code === "P2002") {
      const target = err.meta?.target?.join(", ") ?? "unique field";
      return NextResponse.json(
        { error: `Duplicate value: ${target}. Check for duplicate Student IDs or emails in your file.` },
        { status: 400 }
      );
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "Invalid department. Please ensure the selected department exists." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err.message || "Something went wrong" },
      { status: 500 }
    );
  }
}

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
