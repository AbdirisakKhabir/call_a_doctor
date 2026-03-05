"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import Badge from "@/components/ui/badge/Badge";
import { authFetch } from "@/lib/api";
import { DownloadIcon } from "@/icons";

type Department = { id: number; name: string; code: string };
type ClassItem = {
  id: number;
  name: string;
  semester: string;
  year: number;
  department: { id: number; name: string; code: string };
};

const CURRENT_YEAR = new Date().getFullYear();

export default function StudentTransactionsReportPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [transactions, setTransactions] = useState<
    {
      studentId: string;
      firstName: string;
      lastName: string;
      department: { name: string; code: string };
      class: { department: { code: string }; name: string } | null;
      paidCount: number;
      unpaidCount: number;
      paidSemesters: string[];
      unpaidSemesters: string[];
      totalPaid: number;
      tuitionFee: number | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [filterYear, setFilterYear] = useState(String(CURRENT_YEAR));
  const [filterDept, setFilterDept] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterPhone, setFilterPhone] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: filterYear });
      if (filterDept) params.set("departmentId", filterDept);
      if (filterClass) params.set("classId", filterClass);
      if (filterSearch.trim()) params.set("search", filterSearch.trim());
      if (filterPhone) params.set("phone", filterPhone);
      if (filterDateFrom) params.set("dateFrom", filterDateFrom);
      if (filterDateTo) params.set("dateTo", filterDateTo);
      const res = await authFetch(`/api/finance/students-transactions?${params}`);
      if (res.ok) setTransactions(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, [filterYear, filterDept, filterClass, filterSearch, filterPhone, filterDateFrom, filterDateTo]);

  useEffect(() => {
    authFetch("/api/departments").then((r) => {
      if (r.ok) r.json().then((d: Department[]) => setDepartments(d));
    });
    authFetch("/api/classes").then((r) => {
      if (r.ok) r.json().then((d: ClassItem[]) => setClasses(d));
    });
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const filteredClasses = filterDept
    ? classes.filter((c) => c.department?.id === Number(filterDept))
    : classes;

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const headers = ["Student ID", "Name", "Department", "Class", "Paid", "Unpaid", "Total Paid"];
    const rows = transactions.map((t) => [
      t.studentId,
      `${t.firstName} ${t.lastName}`,
      `${t.department?.code} - ${t.department?.name}`,
      t.class ? `${t.class.department?.code} ${t.class.name}` : "—",
      t.paidCount,
      t.unpaidCount,
      t.totalPaid,
    ]);
    const totalPaid = transactions.reduce((s, t) => s + t.totalPaid, 0);
    const totalRow = ["", "TOTAL", "", "", "", "", totalPaid];
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")), totalRow.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Student_Transactions_${filterYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-print-area">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Student Transactions Report" />
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
        <h1 className="text-xl font-bold text-gray-900">Student Transactions Report</h1>
        <p className="text-sm text-gray-600">
          Year: {filterYear}
          {filterSearch.trim() && ` | Student: "${filterSearch.trim()}"`}
          {" | Generated: "}{new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        <div className="no-print border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Filters</h3>
          <div className="flex flex-wrap gap-4">
            <div className="w-full sm:w-64">
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Search Student</label>
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Name, Student ID, or phone"
                className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white/80 dark:placeholder:text-gray-500"
              />
            </div>
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
                onChange={(e) => { setFilterDept(e.target.value); setFilterClass(""); }}
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
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">Student Transactions</h4>
            {!loading && transactions.length > 0 && (
              <div className="flex flex-wrap gap-4 rounded-xl bg-brand-50 px-4 py-2 dark:bg-brand-500/10">
                <span className="text-sm">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Students: </span>
                  <span className="font-bold text-brand-600 dark:text-brand-400">{transactions.length}</span>
                </span>
                <span className="text-sm">
                  <span className="font-medium text-gray-600 dark:text-gray-400">Total Paid: </span>
                  <span className="font-bold text-green-600 dark:text-green-400">
                    ${transactions.reduce((s, t) => s + t.totalPaid, 0).toLocaleString()}
                  </span>
                </span>
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-transparent! hover:bg-transparent!">
                    <TableCell isHeader>Student ID</TableCell>
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader>Department</TableCell>
                    <TableCell isHeader>Class</TableCell>
                    <TableCell isHeader className="text-center">Semesters Paid</TableCell>
                    <TableCell isHeader className="text-center">Semesters Unpaid</TableCell>
                    <TableCell isHeader className="text-right">Total Paid</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.studentId}>
                      <TableCell>
                        <span className="no-print">
                          <Link href={`/students/${encodeURIComponent(t.studentId)}`} className="font-mono font-medium text-brand-600 hover:underline dark:text-brand-400">
                            {t.studentId}
                          </Link>
                        </span>
                        <span className="hidden print:inline font-mono font-medium text-gray-800">{t.studentId}</span>
                      </TableCell>
                      <TableCell>{t.firstName} {t.lastName}</TableCell>
                      <TableCell>{t.department?.name} ({t.department?.code})</TableCell>
                      <TableCell>{t.class ? `${t.class.department?.code} ${t.class.name}` : "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge color="success" size="sm">{t.paidCount}</Badge>
                        {t.paidSemesters.length > 0 && <span className="ml-1 text-xs text-gray-500">{t.paidSemesters.join(", ")}</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge color={t.unpaidCount > 0 ? "error" : "success"} size="sm">{t.unpaidCount}</Badge>
                        {t.unpaidSemesters.length > 0 && t.unpaidSemesters.length <= 3 && (
                          <span className="ml-1 text-xs text-gray-500">{t.unpaidSemesters.join(", ")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                        ${t.totalPaid.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length > 0 && (
                    <TableRow className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                      <TableCell colSpan={6} className="text-right">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                        ${transactions.reduce((s, t) => s + t.totalPaid, 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
