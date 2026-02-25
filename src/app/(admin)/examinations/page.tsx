"use client";

import React, { useEffect, useState, useCallback } from "react";
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
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";

// Types
type FacultyInfo = { id: number; name: string; code: string };
type DepartmentInfo = { id: number; name: string; code: string; facultyId?: number; faculty?: FacultyInfo };
type ClassInfo = {
  id: number;
  name: string;
  courseId: number;
  semester: string;
  year: number;
  course: { id: number; name: string; code: string; department?: { id: number; name: string; code: string } };
};

type CourseInfo = {
  id: number;
  name: string;
  code: string;
  creditHours: number;
  department?: { id: number; name: string; code: string };
};

type StudentInfo = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  departmentId?: number;
  department?: { id: number; name: string; code: string };
};

type ExamRecord = {
  id: number;
  studentId: number;
  courseId: number;
  semester: string;
  year: number;
  midExam: number | null;
  finalExam: number | null;
  assessment: number | null;
  project: number | null;
  assignment: number | null;
  presentation: number | null;
  totalMarks: number;
  grade: string | null;
  gradePoints: number | null;
  student: StudentInfo;
  course: CourseInfo;
};

type SemesterGPA = {
  semester: string;
  year: number;
  gpa: number;
  totalCredits: number;
  totalGradePoints: number;
  courses: number;
};

type GPAResponse = {
  student: StudentInfo;
  records: ExamRecord[];
  gpa: {
    cumulativeGPA: number;
    totalCredits: number;
    semesters: SemesterGPA[];
  };
};

const GRADE_COLORS: Record<string, "success" | "primary" | "warning" | "error" | "info"> = {
  A: "success",
  "A-": "success",
  "B+": "primary",
  B: "primary",
  "B-": "info",
  "C+": "warning",
  C: "warning",
  D: "error",
  F: "error",
};

type SemesterOption = { id: number; name: string; sortOrder: number; isActive: boolean };

export default function ExaminationsPage() {
  const { hasPermission } = useAuth();
  const [records, setRecords] = useState<ExamRecord[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [faculties, setFaculties] = useState<FacultyInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [filterYear, setFilterYear] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ExamRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // GPA Modal state
  const [showGPAModal, setShowGPAModal] = useState(false);
  const [gpaData, setGpaData] = useState<GPAResponse | null>(null);
  const [gpaLoading, setGpaLoading] = useState(false);

  // Form
  const [form, setForm] = useState({
    studentId: "",
    courseId: "",
    semester: "",
    year: new Date().getFullYear().toString(),
    midExam: "",
    finalExam: "",
    project: "",
    assignment: "",
    presentation: "",
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSemester) params.set("semester", filterSemester);
      if (filterCourseId) params.set("courseId", filterCourseId);
      if (filterYear) params.set("year", filterYear);
      const res = await authFetch(`/api/examinations?${params.toString()}`);
      if (res.ok) setRecords(await res.json());
    } catch { /* empty */ }
    setLoading(false);
  }, [filterSemester, filterCourseId, filterYear]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await authFetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        setStudents(data.filter((s: StudentInfo & { status?: string }) => s.status === "Admitted"));
      }
    } catch { /* empty */ }
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await authFetch("/api/courses");
      if (res.ok) setCourses(await res.json());
    } catch { /* empty */ }
  }, []);

  const fetchFaculties = useCallback(async () => {
    try {
      const res = await authFetch("/api/faculties");
      if (res.ok) setFaculties(await res.json());
    } catch { /* empty */ }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await authFetch("/api/departments");
      if (res.ok) setDepartments(await res.json());
    } catch { /* empty */ }
  }, []);

  const fetchClasses = useCallback(async () => {
    try {
      const res = await authFetch("/api/classes");
      if (res.ok) setClasses(await res.json());
    } catch { /* empty */ }
  }, []);

  const fetchSemesters = useCallback(async () => {
    try {
      const res = await authFetch("/api/semesters?active=true");
      if (res.ok) setSemesters(await res.json());
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchStudents();
    fetchCourses();
    fetchFaculties();
    fetchDepartments();
    fetchClasses();
    fetchSemesters();
  }, [fetchStudents, fetchCourses, fetchFaculties, fetchDepartments, fetchClasses, fetchSemesters]);

  useEffect(() => {
    if (semesters.length > 0 && !form.semester) {
      setForm((f) => ({ ...f, semester: semesters[0].name }));
    }
  }, [semesters]);

  // Filtered records
  const filtered = records.filter((r) => {
    const searchLower = search.toLowerCase();
    const name = `${r.student.firstName} ${r.student.lastName}`.toLowerCase();
    const studentIdStr = r.student.studentId.toLowerCase();
    const courseStr = `${r.course.code} ${r.course.name}`.toLowerCase();
    return (
      name.includes(searchLower) ||
      studentIdStr.includes(searchLower) ||
      courseStr.includes(searchLower)
    );
  });

  // Open edit modal
  const openEdit = (r: ExamRecord) => {
    setEditingRecord(r);
    setForm({
      studentId: r.studentId.toString(),
      courseId: r.courseId.toString(),
      semester: r.semester,
      year: r.year.toString(),
      midExam: (r.midExam || 0).toString(),
      finalExam: (r.finalExam || 0).toString(),
      project: (r.project || 0).toString(),
      assignment: (r.assignment || 0).toString(),
      presentation: (r.presentation || 0).toString(),
    });
    setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        studentId: Number(form.studentId),
        courseId: Number(form.courseId),
        semester: form.semester,
        year: Number(form.year),
        midExam: Number(form.midExam || 0),
        finalExam: Number(form.finalExam || 0),
        assessment: 0,
        project: Number(form.project || 0),
        assignment: Number(form.assignment || 0),
        presentation: Number(form.presentation || 0),
      };

      const url = editingRecord ? `/api/examinations/${editingRecord.id}` : "/api/examinations";
      const method = editingRecord ? "PATCH" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      setShowModal(false);
      fetchRecords();
    } catch {
      setFormError("Network error");
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this exam record?")) return;
    try {
      const res = await authFetch(`/api/examinations/${id}`, { method: "DELETE" });
      if (res.ok) fetchRecords();
    } catch { /* empty */ }
  };

  // GPA view
  const viewGPA = async (studentDbId: number) => {
    setGpaLoading(true);
    setShowGPAModal(true);
    setGpaData(null);
    try {
      const res = await authFetch(`/api/examinations/gpa?studentId=${studentDbId}`);
      if (res.ok) {
        setGpaData(await res.json());
      }
    } catch { /* empty */ }
    setGpaLoading(false);
  };

  // Compute live total in form (no Quiz - Assignment1, Assignment2 only)
  const liveTotal =
    Number(form.midExam || 0) +
    Number(form.finalExam || 0) +
    Number(form.project || 0) +
    Number(form.assignment || 0) +
    Number(form.presentation || 0);

  const getLiveGrade = (total: number) => {
    if (total >= 90) return "A";
    if (total >= 85) return "A-";
    if (total >= 80) return "B+";
    if (total >= 75) return "B";
    if (total >= 70) return "B-";
    if (total >= 65) return "C+";
    if (total >= 60) return "C";
    if (total >= 50) return "D";
    return "F";
  };

  // Get unique years from records
  const years = [...new Set(records.map((r) => r.year))].sort((a, b) => b - a);

  // Get unique student IDs for GPA buttons (deduplicate)
  const uniqueStudentIds = [...new Set(filtered.map((r) => r.studentId))];

  return (
    <div>
      <PageBreadCrumb pageTitle="Exam Records" />

      <div className="mb-4 flex items-center justify-between">
        {hasPermission("examinations.create") && (
          <Link href="/examinations/record" className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20">
            Record Exams →
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        {/* Header */}
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Exam Records
            </h3>
            <Badge variant="light" color="primary">
              {filtered.length} records
            </Badge>
          </div>
          {hasPermission("examinations.create") && (
            <Link
              href="/examinations/record"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
            >
              <PlusIcon className="h-4 w-4" />
              Add Record
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search student, ID, or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-4 text-sm text-gray-800 shadow-sm outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-300 dark:border-gray-700 dark:text-white/80 sm:w-64"
          />
          <select
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none dark:border-gray-700 dark:text-white/80"
          >
            <option value="">All Semesters</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none dark:border-gray-700 dark:text-white/80"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={filterCourseId}
            onChange={(e) => setFilterCourseId(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none dark:border-gray-700 dark:text-white/80"
          >
            <option value="">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Student</TableCell>
                <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Course</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Semester</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Mid /20</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Final /40</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Asg2 /10</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Asg1 /10</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Pres /10</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Total</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Grade</TableCell>
                <TableCell isHeader className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">GP</TableCell>
                <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={13} className="px-5 py-10 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                      <span className="text-sm text-gray-500">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No exam records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-800 dark:hover:bg-white/2">
                    <TableCell className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                          {r.student.firstName[0]}{r.student.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                            {r.student.firstName} {r.student.lastName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{r.student.studentId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{r.course.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.course.name}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center">
                      <Badge variant="light" color="info">{r.semester} {r.year}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.midExam ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.finalExam ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.project ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.assignment ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{r.presentation ?? 0}</TableCell>
                    <TableCell className="px-5 py-3 text-center">
                      <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{r.totalMarks}</span>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center">
                      <Badge variant="solid" color={GRADE_COLORS[r.grade || "F"] || "error"}>
                        {r.grade || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300">{r.gradePoints?.toFixed(1) ?? "0.0"}</TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => viewGPA(r.student.id)}
                          className="rounded-lg p-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                          title="View GPA"
                        >
                          GPA
                        </button>
                        {hasPermission("examinations.edit") && (
                          <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        {hasPermission("examinations.delete") && (
                          <button onClick={() => handleDelete(r.id)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400" title="Delete">
                            <TrashBinIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Unique students with GPA quick access */}
        {uniqueStudentIds.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
            <p className="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Quick GPA Lookup</p>
            <div className="flex flex-wrap gap-2">
              {uniqueStudentIds.map((sid) => {
                const student = records.find((r) => r.studentId === sid)?.student;
                if (!student) return null;
                return (
                  <button
                    key={sid}
                    onClick={() => viewGPA(student.id)}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      {student.firstName[0]}{student.lastName[0]}
                    </span>
                    {student.firstName} {student.lastName}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ======= Add/Edit Modal ======= */}
      {showModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {editingRecord ? "Edit Exam Record" : "Add Exam Record"}
            </h3>
            {formError && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Student */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Student *</label>
                <select
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                  disabled={!!editingRecord}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 disabled:opacity-60 dark:border-gray-700 dark:text-white/80"
                >
                  <option value="">Select Student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.studentId} - {s.firstName} {s.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Course */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Course *</label>
                <select
                  value={form.courseId}
                  onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                  disabled={!!editingRecord}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 disabled:opacity-60 dark:border-gray-700 dark:text-white/80"
                >
                  <option value="">Select Course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name} ({c.creditHours} credits)</option>
                  ))}
                </select>
              </div>

              {/* Semester */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Semester *</label>
                <select
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                  disabled={!!editingRecord}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 disabled:opacity-60 dark:border-gray-700 dark:text-white/80"
                >
                  {semesters.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Year *</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  disabled={!!editingRecord}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 disabled:opacity-60 dark:border-gray-700 dark:text-white/80"
                />
              </div>
            </div>

            {/* Mark Components */}
            <div className="mt-5">
              <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Mark Components</h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Mid Exam <span className="text-gray-400">(/20)</span></label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    value={form.midExam}
                    onChange={(e) => setForm({ ...form, midExam: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Final Exam <span className="text-gray-400">(/40)</span></label>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    step="0.5"
                    value={form.finalExam}
                    onChange={(e) => setForm({ ...form, finalExam: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Assignment 2 <span className="text-gray-400">(/10)</span></label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Assignment 1 <span className="text-gray-400">(/10)</span></label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={form.assignment}
                    onChange={(e) => setForm({ ...form, assignment: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Presentation <span className="text-gray-400">(/10)</span></label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={form.presentation}
                    onChange={(e) => setForm({ ...form, presentation: e.target.value })}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                  />
                </div>
              </div>
            </div>

            {/* Live Total & Grade Preview */}
            <div className="mt-5 flex items-center gap-6 rounded-xl bg-gray-50 px-5 py-3 dark:bg-white/5">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{liveTotal}<span className="text-sm font-normal text-gray-400">/90</span></p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Grade</p>
                <Badge variant="solid" color={GRADE_COLORS[getLiveGrade(liveTotal)] || "error"}>
                  {getLiveGrade(liveTotal)}
                </Badge>
              </div>
              <div className="ml-auto h-3 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-full rounded-full transition-all ${liveTotal >= 75 ? "bg-green-500" : liveTotal >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(liveTotal, 100)}%` }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.studentId || !form.courseId}>
                {saving ? "Saving..." : editingRecord ? "Update Record" : "Add Record"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ======= GPA Modal ======= */}
      {showGPAModal && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            {gpaLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-500 border-t-transparent" />
              </div>
            ) : gpaData ? (
              <>
                {/* Student Header */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    {gpaData.student.firstName[0]}{gpaData.student.lastName[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                      {gpaData.student.firstName} {gpaData.student.lastName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{gpaData.student.studentId} &middot; {gpaData.student.department?.name}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Cumulative GPA</p>
                    <p className={`text-3xl font-bold ${gpaData.gpa.cumulativeGPA >= 3.0 ? "text-green-600 dark:text-green-400" : gpaData.gpa.cumulativeGPA >= 2.0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                      {gpaData.gpa.cumulativeGPA.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{gpaData.gpa.totalCredits} total credits</p>
                  </div>
                </div>

                {/* Semester GPAs */}
                {gpaData.gpa.semesters.length > 0 && (
                  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {gpaData.gpa.semesters.map((sem) => (
                      <div
                        key={`${sem.semester}-${sem.year}`}
                        className="rounded-xl border border-gray-100 px-4 py-3 dark:border-gray-800"
                      >
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{sem.semester} {sem.year}</p>
                        <p className={`text-xl font-bold ${sem.gpa >= 3.0 ? "text-green-600 dark:text-green-400" : sem.gpa >= 2.0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                          {sem.gpa.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-gray-400">{sem.courses} courses &middot; {sem.totalCredits} credits</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Detailed Records */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Course</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Semester</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Credits</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Total</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Grade</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">GP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gpaData.records.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800">
                          <td className="px-3 py-2">
                            <span className="font-medium text-gray-800 dark:text-white/90">{r.course.code}</span>
                            <span className="ml-2 text-gray-500 dark:text-gray-400">{r.course.name}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{r.semester} {r.year}</td>
                          <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{r.course.creditHours}</td>
                          <td className="px-3 py-2 text-center font-medium text-gray-800 dark:text-white/90">{r.totalMarks}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="solid" color={GRADE_COLORS[r.grade || "F"] || "error"}>
                              {r.grade || "N/A"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300">{r.gradePoints?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-gray-500">Failed to load GPA data.</p>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowGPAModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
