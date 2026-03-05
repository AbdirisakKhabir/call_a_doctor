"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { DownloadIcon } from "@/icons";

type SemesterOption = { id: number; name: string; sortOrder: number; isActive: boolean };
type ClassOption = { id: number; name: string; semester: string; year: number; department: { id: number; code: string; name: string } };
type UnpaidStudent = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  department: { name: string; code: string; tuitionFee: number | null };
  tuitionFee: number | null;
  paymentStatus?: string;
  amountPaid?: number;
  amountDue?: number;
};
const CURRENT_YEAR = new Date().getFullYear();

export default function UnpaidStudentsReportPage() {
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [unpaidSemester, setUnpaidSemester] = useState("");
  const [unpaidYear, setUnpaidYear] = useState(String(CURRENT_YEAR));
  const [unpaidClassId, setUnpaidClassId] = useState("");
  const [unpaidStudents, setUnpaidStudents] = useState<UnpaidStudent[]>([]);
  const [unpaidClassInfo, setUnpaidClassInfo] = useState<{ name: string; semester: string; year: number; department: { code: string; name: string } } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authFetch("/api/semesters?active=true").then((r) => {
      if (r.ok) r.json().then((d: SemesterOption[]) => {
        setSemesters(d);
        if (d.length > 0 && !unpaidSemester) setUnpaidSemester(d[0].name);
      });
    });
    authFetch("/api/classes").then((r) => {
      if (r.ok) r.json().then((d: ClassOption[]) => setClasses(d));
    });
  }, []);

  useEffect(() => {
    if (semesters.length > 0 && !unpaidSemester) setUnpaidSemester(semesters[0].name);
  }, [semesters, unpaidSemester]);

  const filteredClasses = classes.filter(
    (c) => c.semester === unpaidSemester && c.year === Number(unpaidYear)
  );

  useEffect(() => {
    if (unpaidClassId && !filteredClasses.some((c) => c.id === Number(unpaidClassId))) {
      setUnpaidClassId("");
    }
  }, [filteredClasses, unpaidClassId]);

  const handleGenerate = async () => {
    if (!unpaidSemester || !unpaidYear || !unpaidClassId) return;
    setLoading(true);
    setUnpaidClassInfo(null);
    setUnpaidStudents([]);
    try {
      const params = new URLSearchParams({
        semester: unpaidSemester,
        year: unpaidYear,
        classId: unpaidClassId,
      });
      const res = await authFetch(`/api/finance/unpaid-students?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to load unpaid students");
        return;
      }
      setUnpaidClassInfo(data.class);
      setUnpaidStudents(data.unpaidStudents || []);
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    if (unpaidStudents.length === 0) return;
    const headers = ["Student ID", "First Name", "Last Name", "Email", "Phone", "Department", "Payment Status", "Amount Due"];
    const rows = unpaidStudents.map((s) => [
      s.studentId,
      s.firstName,
      s.lastName,
      s.email || "",
      s.phone || "",
      `${s.department.code} - ${s.department.name}`,
      s.paymentStatus || "Fully Paid",
      s.tuitionFee != null ? String(s.tuitionFee) : "",
    ]);
    const totalDue = unpaidStudents.reduce((s, t) => s + (t.tuitionFee ?? 0), 0);
    const totalRow = ["", "TOTAL", "", "", "", "", "", totalDue.toFixed(2)];
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")), totalRow.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Unpaid_Students_${unpaidClassInfo?.department?.code || "class"}_${unpaidSemester}_${unpaidYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Unpaid Students Report" />
        {unpaidClassInfo && unpaidStudents.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" startIcon={<DownloadIcon />} onClick={handleExportCSV}>
              Export CSV
            </Button>
            <Button size="sm" onClick={handlePrint}>
              Print
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/5">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Unpaid Students by Semester & Class
        </h3>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          Select a semester, year, and class to generate a list of students who have not paid tuition for that term.
        </p>
        <div className="no-print mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Semester</label>
            <select
              value={unpaidSemester}
              onChange={(e) => setUnpaidSemester(e.target.value)}
              className="h-10 min-w-[120px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white dark:focus:border-brand-500/40"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
            <input
              type="number"
              value={unpaidYear}
              onChange={(e) => setUnpaidYear(e.target.value)}
              className="h-10 min-w-[100px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white dark:focus:border-brand-500/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Class</label>
            <select
              value={unpaidClassId}
              onChange={(e) => setUnpaidClassId(e.target.value)}
              className="h-10 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white dark:focus:border-brand-500/40"
            >
              <option value="">Select class</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.department.code} - {c.name} ({c.semester} {c.year})
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={!unpaidClassId || loading}>
            {loading ? "Loading..." : "Generate List"}
          </Button>
        </div>

        {unpaidClassInfo && (
          <>
            <div className="mb-4 print:block hidden print:mb-2">
              <h1 className="text-xl font-bold text-gray-900">Unpaid Students Report</h1>
              <p className="text-sm text-gray-600">
                {unpaidClassInfo.department.code} - {unpaidClassInfo.name} ({unpaidClassInfo.semester} {unpaidClassInfo.year})
              </p>
              <p className="text-sm text-gray-600">Generated: {new Date().toLocaleDateString()}</p>
            </div>

            {unpaidStudents.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-gray-700 dark:bg-white/5">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  All students in this class have paid for {unpaidClassInfo.semester} {unpaidClassInfo.year}.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-4 rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
                  <span className="text-sm">
                    <span className="font-medium text-gray-600 dark:text-gray-400">Students: </span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">{unpaidStudents.length}</span>
                  </span>
                  <span className="text-sm">
                    <span className="font-medium text-gray-600 dark:text-gray-400">Total Amount Due: </span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      ${unpaidStudents
                        .reduce((s, t) => s + (t.tuitionFee ?? 0), 0)
                        .toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-transparent! hover:bg-transparent!">
                        <TableCell isHeader>Student ID</TableCell>
                        <TableCell isHeader>Name</TableCell>
                        <TableCell isHeader>Email</TableCell>
                        <TableCell isHeader>Phone</TableCell>
                        <TableCell isHeader>Department</TableCell>
                        <TableCell isHeader>Payment</TableCell>
                        <TableCell isHeader className="text-right">Amount Due</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidStudents.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <span className="no-print">
                              <Link
                                href={`/students/${encodeURIComponent(s.studentId)}`}
                                className="font-mono font-medium text-brand-600 hover:underline dark:text-brand-400"
                              >
                                {s.studentId}
                              </Link>
                            </span>
                            <span className="hidden print:inline font-mono font-medium text-gray-800">{s.studentId}</span>
                          </TableCell>
                          <TableCell>{s.firstName} {s.lastName}</TableCell>
                          <TableCell>{s.email || "—"}</TableCell>
                          <TableCell>{s.phone || "—"}</TableCell>
                          <TableCell>{s.department.code} - {s.department.name}</TableCell>
                          <TableCell>{s.paymentStatus || "Fully Paid"}</TableCell>
                          <TableCell className="text-right">
                            {s.tuitionFee != null ? `$${Number(s.tuitionFee).toLocaleString()}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                        <TableCell colSpan={6} className="text-right">
                          Total
                        </TableCell>
                        <TableCell className="text-right font-bold text-amber-600 dark:text-amber-400">
                          ${unpaidStudents
                            .reduce((s, t) => s + (t.tuitionFee ?? 0), 0)
                            .toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
