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
type Student = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  admissionDate: string;
  department: { id: number; name: string; code: string };
};

const STATUS_COLOR: Record<string, "success" | "warning" | "error" | "info"> = {
  Admitted: "success",
  Pending: "warning",
  Rejected: "error",
  Graduated: "info",
};

export default function AdmissionReportPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<{ total: number; byStatus: Record<string, number> }>({ total: 0, byStatus: {} });
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDept) params.set("departmentId", filterDept);
      if (filterClass) params.set("classId", filterClass);
      if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
      const res = await authFetch(`/api/reports/admission?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setSummary(data.summary || { total: 0, byStatus: {} });
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [filterDept, filterClass, filterStatus]);

  useEffect(() => {
    authFetch("/api/departments").then((r) => { if (r.ok) r.json().then((d: Department[]) => setDepartments(d)); });
    authFetch("/api/classes").then((r) => { if (r.ok) r.json().then((d: ClassItem[]) => setClasses(d)); });
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filteredClasses = filterDept ? classes.filter((c) => c.department?.id === Number(filterDept)) : classes;

  const handlePrint = () => window.print();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Admission Report" />
        <Button size="sm" onClick={handlePrint}>Print</Button>
      </div>

      <div className="mb-4 print:block hidden print:mb-2">
        <h1 className="text-xl font-bold text-gray-900">Admission Report</h1>
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
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-10 min-w-[140px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="all">All Statuses</option>
                <option value="Admitted">Admitted</option>
                <option value="Pending">Pending</option>
                <option value="Rejected">Rejected</option>
                <option value="Graduated">Graduated</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="rounded-xl bg-brand-50 px-4 py-2 dark:bg-brand-500/10">
            <span className="text-xs text-gray-500 dark:text-gray-400">Total Students</span>
            <p className="text-xl font-bold text-brand-600 dark:text-brand-400">{summary.total}</p>
          </div>
          {Object.entries(summary.byStatus || {}).map(([status, count]) => (
            <div key={status} className="rounded-xl bg-gray-50 px-4 py-2 dark:bg-white/5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{status}</span>
              <p className="text-xl font-bold text-gray-800 dark:text-white/90">{count}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Student ID</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Email</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Department</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Admission Date</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-5 py-10 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                      <span className="text-sm text-gray-500">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                    No students match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                students.map((s) => (
                  <TableRow key={s.id} className="border-b border-gray-50 dark:border-gray-800">
                    <TableCell className="px-5 py-3 font-mono text-sm text-gray-700 dark:text-gray-300">{s.studentId}</TableCell>
                    <TableCell className="px-5 py-3 font-medium text-gray-800 dark:text-white/90">{s.firstName} {s.lastName}</TableCell>
                    <TableCell className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">{s.email ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge variant="light" color="info">{s.department?.code ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center">
                      <Badge variant="light" color={STATUS_COLOR[s.status] || "info"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {s.admissionDate ? new Date(s.admissionDate).toLocaleDateString() : "—"}
                    </TableCell>
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
