import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const departments = await prisma.department.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    const headers = [
      "Student ID",
      "Full Name",
      "Mother Name",
      "Parent Phone",
      "Email",
      "Phone",
      "Date of Birth",
      "Gender",
      "Address",
      "Department Code",
      "Program",
      "Status",
      "Payment Status",
    ];

    const sampleRow = [
      "",
      "Ahmed Hassan",
      "Fatima Hassan",
      "+252 61 1234567",
      "ahmed@example.com",
      "+252 61 7654321",
      "2005-01-15",
      "Male",
      "Hargeisa, Somaliland",
      departments[0]?.code ?? "CS",
      "Bachelor",
      "Admitted",
      "Fully Paid",
    ];

    const wsData = [headers, sampleRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws["!cols"] = headers.map((_, i) => ({ wch: i === 9 ? 20 : 14 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = "Student_Import_Template.xlsx";

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("Student template error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
