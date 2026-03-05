"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";

type Department = { id: number; name: string; code: string };
type ClassItem = {
  id: number;
  name: string;
  semester: string;
  year: number;
  department: { id: number; name: string; code: string };
};
type ExamRecord = {
  id: number;
  semester: string;
  year: number;
  midExam: number | null;
  finalExam: number | null;
  totalMarks: number;
  grade: string | null;
  gradePoints: number | null;
  student: { studentId: string; firstName: string; lastName: string; department: { code: string } };
  course: { code: string; name: string; creditHours: number };
  attendancePercent?: number;
  attendanceMarks?: number;
  totalSessions?: number;
};

type SemesterOption = { id: number; name: string; sortOrder: number; isActive: boolean };
const GRADE_COLOR: Record<string, "success" | "primary" | "warning" | "error" | "info"> = {
  A: "success", "A-": "success", "B+": "primary", B: "primary", "B-": "info",
  "C+": "warning", C: "warning", D: "error", F: "error",
};

export default function ExamReportPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [summary, setSummary] = useState<{ total: number; byGrade: Record<string, number>; avgGradePoints: number }>({
    total: 0, byGrade: {}, avgGradePoints: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterYear, setFilterYear] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDept) params.set("departmentId", filterDept);
      if (filterClass) params.set("classId", filterClass);
      if (filterSemester && filterSemester !== "all") params.set("semester", filterSemester);
      if (filterYear) params.set("year", filterYear);
      const res = await authFetch(`/api/reports/exam?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setSummary(data.summary || { total: 0, byGrade: {}, avgGradePoints: 0 });
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [filterDept, filterClass, filterSemester, filterYear]);

  useEffect(() => {
    authFetch("/api/departments").then((r) => { if (r.ok) r.json().then((d: Department[]) => setDepartments(d)); });
    authFetch("/api/classes").then((r) => { if (r.ok) r.json().then((d: ClassItem[]) => setClasses(d)); });
    authFetch("/api/semesters?active=true").then((r) => { if (r.ok) r.json().then((d: SemesterOption[]) => setSemesters(d)); });
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filteredClasses = filterDept ? classes.filter((c) => c.department?.id === Number(filterDept)) : classes;
  const currentYear = new Date().getFullYear();

  const handlePrint = () => window.print();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Exam Report" />
        <Button size="sm" onClick={handlePrint}>Print</Button>
      </div>

      <div className="mb-4 print:block hidden print:mb-2">
        <h1 className="text-xl font-bold text-gray-900">Exam Report</h1>
        <p className="text-sm text-gray-600">Generated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        <div className="no-print border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Filters</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Department</label>
              <select
                value={filterDept}
                onChange={(e) => {
                  setFilterDept(e.target.value);
                  setFilterClass("");
                }}
                className="h-10 min-w-[180px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="h-10 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">All Classes</option>
                {filteredClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.department?.code} - {c.name} ({c.semester} {c.year})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Semester</label>
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                className="h-10 min-w-[120px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="all">All</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Year</label>
              <input
                type="number"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                placeholder={`e.g. ${currentYear}`}
                className="h-10 min-w-[100px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="rounded-xl bg-brand-50 px-4 py-2 dark:bg-brand-500/10">
            <span className="text-xs text-gray-500 dark:text-gray-400">Total Records</span>
            <p className="text-xl font-bold text-brand-600 dark:text-brand-400">{summary.total}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-2 dark:bg-white/5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Avg Grade Points</span>
            <p className="text-xl font-bold text-gray-800 dark:text-white/90">{summary.avgGradePoints.toFixed(2)}</p>
          </div>
          {Object.entries(summary.byGrade || {}).map(([grade, count]) => (
            <div key={grade} className="rounded-xl bg-gray-50 px-4 py-2 dark:bg-white/5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Grade {grade}</span>
              <p className="text-xl font-bold text-gray-800 dark:text-white/90">{count}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Student</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Course</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Semester</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Year</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Mid</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Final</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Total</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Grade</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">GP</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-5 py-10 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                      <span className="text-sm text-gray-500">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">
                    No exam records match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id} className="border-b border-gray-50 dark:border-gray-800">
                    <TableCell className="px-5 py-3">
                      <p className="font-medium text-gray-800 dark:text-white/90">{r.student.firstName} {r.student.lastName}</p>
                      <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.student.studentId}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <p className="font-medium text-gray-800 dark:text-white/90">{r.course.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.course.name}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.semester}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.year}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.midExam ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.finalExam ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center font-medium text-gray-800 dark:text-white/90">{r.totalMarks}</TableCell>
                    <TableCell className="px-5 py-3 text-center">
                      <Badge variant="solid" color={GRADE_COLOR[r.grade || "F"] || "error"} size="sm">{r.grade || "N/A"}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center font-medium text-gray-700 dark:text-gray-300">{r.gradePoints?.toFixed(1) ?? "0.0"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
