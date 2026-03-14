"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
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
import Link from "next/link";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ArrowUpIcon, DownloadIcon, PencilIcon, PlusIcon, TrashBinIcon, UserCircleIcon } from "@/icons";

type Department = { id: number; name: string; code: string };

type ClassInfo = {
  id: number;
  name: string;
  semester: string;
  year: number;
  course: { code: string };
  departmentId?: number;
};

type StudentRow = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  motherName: string | null;
  parentPhone: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  departmentId: number;
  department: Department;
  classId: number | null;
  class: ClassInfo | null;
  program: string | null;
  admissionDate: string;
  status: string;
  paymentStatus: string;
  balance: number;
  createdAt: string;
};

const STATUSES = ["Pending", "Admitted", "Rejected", "Graduated"];

const STATUS_COLOR: Record<string, "warning" | "success" | "error" | "info" | "primary"> = {
  Pending: "warning",
  Admitted: "success",
  Rejected: "error",
  Graduated: "info",
};

const PAYMENT_STATUSES = ["Full Scholarship", "Half Scholar", "Fully Paid"] as const;

const PAYMENT_STATUS_COLOR: Record<string, "success" | "info" | "primary"> = {
  "Full Scholarship": "success",
  "Half Scholar": "info",
  "Fully Paid": "primary",
};

export default function AdmissionPage() {
  const { hasPermission } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDeptId, setFilterDeptId] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modal, setModal] = useState<"import" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDepartmentId, setImportDepartmentId] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors?: string[] } | null>(null);

  const canCreate = hasPermission("admission.create");
  const canEdit = hasPermission("admission.edit");
  const canDelete = hasPermission("admission.delete");

  async function loadStudents() {
    const res = await authFetch("/api/students");
    if (res.ok) setStudents(await res.json());
  }

  async function loadDepartments() {
    const res = await authFetch("/api/departments");
    if (res.ok) {
      const data = await res.json();
      setDepartments(
        data.map((d: Department & Record<string, unknown>) => ({
          id: d.id,
          name: d.name,
          code: d.code,
        }))
      );
    }
  }

  async function loadClasses() {
    const res = await authFetch("/api/classes");
    if (res.ok) {
      const data = await res.json();
      setClasses(
        data.map((c: { id: number; name: string; semester: string; year: number; department: { id: number; code: string } }) => ({
          id: c.id,
          name: c.name,
          semester: c.semester,
          year: c.year,
          department: { code: c.department?.code ?? "" },
          departmentId: c.department?.id ?? 0,
        }))
      );
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStudents(), loadDepartments(), loadClasses()]);
      setLoading(false);
    })();
  }, []);

  async function handleDownloadTemplate() {
    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await authFetch("/api/students/template");
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to download template");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Student_Import_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download template");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleImportExcel() {
    if (!importFile || !importDepartmentId) {
      alert("Please select a department and choose an Excel file.");
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("departmentId", importDepartmentId);
      const res = await authFetch("/api/students/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Import failed");
        return;
      }
      setImportResult({ created: data.created, errors: data.errors });
      setImportFile(null);
      await loadStudents();
    } catch {
      alert("Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this student record?")) return;
    const res = await authFetch(`/api/students/${id}`, { method: "DELETE" });
    if (res.ok) await loadStudents();
    else {
      const data = await res.json();
      alert(data.error || "Failed to delete");
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected student(s)?`)) return;
    setBulkDeleting(true);
    try {
      const res = await authFetch("/api/students/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedIds(new Set());
        await loadStudents();
        if (data.errors?.length) {
          alert(`Deleted ${data.deleted}. ${data.skipped} failed:\n${data.errors.slice(0, 5).join("\n")}${data.errors.length > 5 ? `\n... and ${data.errors.length - 5} more` : ""}`);
        }
      } else {
        alert(data.error || "Bulk delete failed");
      }
    } catch {
      alert("Bulk delete failed");
    }
    setBulkDeleting(false);
  }

  async function handleDeleteByDepartment() {
    if (filterDeptId === "all") {
      alert("Select a department first to delete all its students.");
      return;
    }
    const deptName = departments.find((d) => String(d.id) === filterDeptId)?.name ?? "this department";
    if (!confirm(`Delete ALL students in ${deptName}?`)) return;
    setBulkDeleting(true);
    try {
      const res = await authFetch("/api/students/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: Number(filterDeptId) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedIds(new Set());
        await loadStudents();
        if (data.errors?.length) {
          alert(`Deleted ${data.deleted}. ${data.skipped} failed.`);
        }
      } else {
        alert(data.error || "Bulk delete failed");
      }
    } catch {
      alert("Bulk delete failed");
    }
    setBulkDeleting(false);
  }

  const filtered = students.filter((s) => {
    if (filterDeptId !== "all" && String(s.departmentId) !== filterDeptId) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.studentId.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      (s.email?.toLowerCase().includes(q) ?? false) ||
      s.department.name.toLowerCase().includes(q) ||
      (s.motherName?.toLowerCase().includes(q) ?? false)
    );
  });

  if (!hasPermission("admission.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Admission" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/10">
            <svg className="h-6 w-6 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to view admissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Admission" />
        <div className="flex items-center gap-2">
          {canCreate && (
            <>
              <Button
                variant="outline"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                disabled={importLoading}
                size="sm"
              >
                Template
              </Button>
              <Button
                variant="outline"
                startIcon={<ArrowUpIcon />}
                onClick={() => {
                  setModal("import");
                  setImportResult(null);
                  setImportFile(null);
                  setImportDepartmentId(departments[0] ? String(departments[0].id) : "");
                }}
                size="sm"
              >
                Import Excel
              </Button>
              <Link href="/admission/new">
                <Button startIcon={<PlusIcon />} size="sm">
                  New Student
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATUSES.map((st) => {
          const count = students.filter((s) => s.status === st).length;
          return (
            <div
              key={st}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3"
            >
              <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                {count}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {st}
              </p>
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Students
            </h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              {filtered.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {canDelete && filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || bulkDeleting}
                  className="text-error-600 border-error-200 hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
                >
                  {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size} selected`}
                </Button>
                {filterDeptId !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteByDepartment}
                    disabled={bulkDeleting}
                    className="text-error-600 border-error-200 hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-500/10"
                  >
                    Delete all in department
                  </Button>
                )}
              </div>
            )}
            <select
              value={filterDeptId}
              onChange={(e) => { setFilterDeptId(e.target.value); setSelectedIds(new Set()); }}
              className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-700 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-gray-300 dark:focus:border-brand-500/40"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-700 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-gray-300 dark:focus:border-brand-500/40"
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="relative w-full sm:w-64">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search students..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-gray-300 dark:placeholder:text-gray-500 dark:focus:border-brand-500/40"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {search || filterStatus !== "all" || filterDeptId !== "all"
                ? "No students match your filters."
                : "No students yet. Add a new student to get started."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                {canDelete && filtered.length > 0 && (
                  <TableCell isHeader className="w-12 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                      aria-label="Select all"
                    />
                  </TableCell>
                )}
                <TableCell isHeader>#</TableCell>
                <TableCell isHeader>Student</TableCell>
                <TableCell isHeader>Student ID</TableCell>
                <TableCell isHeader>Department</TableCell>
                <TableCell isHeader>Status</TableCell>
                <TableCell isHeader>Payment</TableCell>
                <TableCell isHeader className="text-right">Balance</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s, idx) => (
                <TableRow key={s.id}>
                  {canDelete && filtered.length > 0 && (
                    <TableCell className="w-12 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                        aria-label={`Select ${s.studentId}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-gray-400 dark:text-gray-500">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {s.imageUrl ? (
                        <Image
                          src={s.imageUrl}
                          alt={`${s.firstName} ${s.lastName}`}
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                          {s.firstName.charAt(0)}{s.lastName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/students/${encodeURIComponent(s.studentId)}`}
                          className="font-semibold text-gray-800 hover:text-brand-600 hover:underline dark:text-white/90 dark:hover:text-brand-400"
                        >
                          {s.firstName} {s.lastName}
                        </Link>
                        {s.gender && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {s.gender}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/${encodeURIComponent(s.studentId)}`}
                      className="font-mono text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {s.studentId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge color="info" size="sm">{s.department.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color={STATUS_COLOR[s.status] || "light"} size="sm">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color={PAYMENT_STATUS_COLOR[s.paymentStatus] || "light"} size="sm">
                      {s.paymentStatus || "Fully Paid"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-800 dark:text-white/90">
                    ${(s.balance ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/students/${encodeURIComponent(s.studentId)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                        aria-label="View Profile & ID Card"
                        title="View Profile & ID Card"
                      >
                        <UserCircleIcon className="h-4 w-4" />
                      </Link>
                      {canEdit && (
                        <Link
                          href={`/admission/${s.id}/edit`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-500 dark:hover:bg-brand-500/10"
                          aria-label="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-500/10"
                          aria-label="Delete"
                        >
                          <TrashBinIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Import Modal */}
      {modal === "import" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Import Students from Excel
              </h2>
              <button
                type="button"
                onClick={() => { setModal(null); setImportFile(null); setImportResult(null); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a department, then upload an Excel file. The file should have a name column (Full Name, Name, or First Name + Last Name). Names are split by space: first word = First Name, rest = Last Name.
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Department
                </label>
                <select
                  value={importDepartmentId}
                  onChange={(e) => setImportDepartmentId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-700 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-gray-300 dark:focus:border-brand-500/40"
                >
                  <option value="">Select department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} disabled={importLoading} size="sm">
                Download Template
              </Button>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Excel File
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100 dark:file:bg-brand-500/10 dark:file:text-brand-400"
                />
              </div>
              {importResult && (
                <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-400">
                  <p className="font-medium">Imported {importResult.created} student(s) successfully.</p>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-error-600 dark:text-error-400">
                        {importResult.errors.length} error(s)
                      </summary>
                      <ul className="mt-1 list-inside list-disc text-error-600 dark:text-error-400">
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {importResult.errors.length > 10 && (
                          <li>...and {importResult.errors.length - 10} more</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setModal(null); setImportFile(null); setImportResult(null); }} size="sm">
                  Close
                </Button>
                <Button
                  onClick={handleImportExcel}
                  disabled={!importDepartmentId || !importFile || importLoading}
                  size="sm"
                >
                  {importLoading ? "Importing..." : "Import"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
