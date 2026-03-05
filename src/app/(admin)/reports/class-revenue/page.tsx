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
import { DownloadIcon } from "@/icons";

type Department = { id: number; name: string; code: string };
type SemesterOption = { id: number; name: string; sortOrder: number; isActive: boolean };
const CURRENT_YEAR = new Date().getFullYear();

export default function ClassRevenueReportPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [revenue, setRevenue] = useState<
    {
      id: number;
      name: string;
      semester: string;
      year: number;
      course: { code: string; name: string };
      department?: { id: number; name: string; code: string };
      studentCount: number;
      paidCount: number;
      unpaidCount: number;
      revenue: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [filterYear, setFilterYear] = useState(String(CURRENT_YEAR));
  const [filterDept, setFilterDept] = useState("");
  const [filterSemester, setFilterSemester] = useState("");

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: filterYear });
      if (filterDept) params.set("departmentId", filterDept);
      if (filterSemester) params.set("semester", filterSemester);
      const res = await authFetch(`/api/finance/class-revenue?${params.toString()}`);
      if (res.ok) setRevenue(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, [filterYear, filterDept, filterSemester]);

  useEffect(() => {
    authFetch("/api/departments").then((r) => {
      if (r.ok) r.json().then((d: Department[]) => setDepartments(d));
    });
    authFetch("/api/semesters?active=true").then((r) => {
      if (r.ok) r.json().then((d: SemesterOption[]) => setSemesters(d));
    });
  }, []);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  const totalRevenue = revenue.reduce((sum, r) => sum + r.revenue, 0);

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const headers = ["Class", "Course", "Department", "Semester", "Students", "Paid", "Unpaid", "Revenue"];
    const rows = revenue.map((r) => [
      r.name,
      r.department ? `${r.department.code} - ${r.department.name}` : "—",
      r.department ? `${r.department.code} - ${r.department.name}` : "—",
      `${r.semester} ${r.year}`,
      r.studentCount,
      r.paidCount,
      r.unpaidCount,
      r.revenue,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Class_Revenue_${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-print-area">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Class Revenue Report" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" startIcon={<DownloadIcon />} onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button size="sm" onClick={handlePrint}>
            Print
          </Button>
        </div>
      </div>

      <div className="mb-4 print:block hidden print:mb-2">
        <h1 className="text-xl font-bold text-gray-900">Class Revenue Report</h1>
        <p className="text-sm text-gray-600">Year: {filterYear} | Generated: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        <div className="no-print border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Filters</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="h-10 min-w-[120px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Department</label>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="h-10 min-w-[180px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Semester</label>
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                className="h-10 min-w-[140px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">All Semesters</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <h4 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">Class Revenue</h4>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 dark:bg-brand-500/10">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue: </span>
                <span className="text-lg font-bold text-brand-600 dark:text-brand-400">
                  ${totalRevenue.toLocaleString()}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-transparent! hover:bg-transparent!">
                      <TableCell isHeader>Class</TableCell>
                      <TableCell isHeader>Course</TableCell>
                      <TableCell isHeader>Department</TableCell>
                      <TableCell isHeader>Semester</TableCell>
                      <TableCell isHeader className="text-center">Students</TableCell>
                      <TableCell isHeader className="text-center">Paid</TableCell>
                      <TableCell isHeader className="text-center">Unpaid</TableCell>
                      <TableCell isHeader className="text-right">Revenue</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenue.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.department ? `${r.department.code} - ${r.department.name}` : "—"}</TableCell>
                        <TableCell>{r.department ? `${r.department.code} - ${r.department.name}` : "—"}</TableCell>
                        <TableCell>{r.semester} {r.year}</TableCell>
                        <TableCell className="text-center">{r.studentCount}</TableCell>
                        <TableCell className="text-center">
                          <Badge color="success" size="sm">{r.paidCount}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge color={r.unpaidCount > 0 ? "error" : "success"} size="sm">{r.unpaidCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                          ${r.revenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {revenue.length > 0 && (
                      <TableRow className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                        <TableCell colSpan={4} className="font-bold">
                          Total
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {revenue.reduce((s, r) => s + r.studentCount, 0)}
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {revenue.reduce((s, r) => s + r.paidCount, 0)}
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {revenue.reduce((s, r) => s + r.unpaidCount, 0)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                          ${totalRevenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
