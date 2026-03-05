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
import { useAuth } from "@/context/AuthContext";
import { DownloadIcon } from "@/icons";

type FacultyInfo = { id: number; name: string; code: string };
type DepartmentInfo = { id: number; name: string; code: string; facultyId?: number; faculty?: FacultyInfo };
type ClassInfo = {
  id: number;
  name: string;
  departmentId: number;
  department: { id: number; name: string; code: string };
  semester: string;
  year: number;
};

type CourseInfo = { id: number; name: string; code: string; departmentId?: number };

export default function RecordExamsPage() {
  const { hasPermission } = useAuth();
  const [faculties, setFaculties] = useState<FacultyInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  const [templateFacultyId, setTemplateFacultyId] = useState("");
  const [templateDepartmentId, setTemplateDepartmentId] = useState("");
  const [templateClassId, setTemplateClassId] = useState("");
  const [templateCourseId, setTemplateCourseId] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);

  const [importClassId, setImportClassId] = useState("");
  const [importCourseId, setImportCourseId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors?: string[] } | null>(null);

  const [recordDepartmentId, setRecordDepartmentId] = useState("");
  const [recordClassId, setRecordClassId] = useState("");
  const [recordCourseId, setRecordCourseId] = useState("");
  const [recordClassData, setRecordClassData] = useState<{
    class: { id: number; name: string; semester: string; year: number; department: { id: number; name: string; code: string } };
    course?: { id: number; name: string; code: string };
    totalSessions?: number;
    rows: {
      student: { id: number; studentId: string; firstName: string; lastName: string };
      attendance?: { present: number; absent: number; excused: number; totalSessions: number; attendancePercent: number; attendanceMarks: number };
      record: {
        midExam: number;
        finalExam: number;
        project: number;
        assignment: number;
        presentation: number;
        totalMarks: number;
        grade: string;
        gradePoints: number;
      } | null;
    }[];
  } | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordSaveResult, setRecordSaveResult] = useState<string | null>(null);

  const [courses, setCourses] = useState<CourseInfo[]>([]);

  useEffect(() => {
    authFetch("/api/faculties").then((r) => { if (r.ok) r.json().then(setFaculties); });
    authFetch("/api/departments").then((r) => { if (r.ok) r.json().then(setDepartments); });
    authFetch("/api/classes").then((r) => { if (r.ok) r.json().then(setClasses); });
    authFetch("/api/courses").then((r) => { if (r.ok) r.json().then(setCourses); });
  }, []);

  useEffect(() => {
    if (!recordClassId || !recordCourseId) {
      setRecordClassData(null);
      return;
    }
    setRecordLoading(true);
    setRecordSaveResult(null);
    authFetch(`/api/examinations/record-class?classId=${recordClassId}&courseId=${recordCourseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setRecordClassData(data?.rows ? data : null))
      .catch(() => setRecordClassData(null))
      .finally(() => setRecordLoading(false));
  }, [recordClassId, recordCourseId]);

  const filteredDepartments = templateFacultyId
    ? departments.filter((d) => (d.facultyId ?? d.faculty?.id) === Number(templateFacultyId))
    : departments;
  const filteredClasses = templateDepartmentId
    ? classes.filter((c) => c.department?.id === Number(templateDepartmentId))
    : classes;
  const recordClasses = recordDepartmentId
    ? classes.filter((c) => c.department?.id === Number(recordDepartmentId))
    : classes;
  const recordCourses = recordDepartmentId
    ? courses.filter((c) => c.departmentId === Number(recordDepartmentId))
    : courses;
  const templateCourses = templateDepartmentId
    ? courses.filter((c) => c.departmentId === Number(templateDepartmentId))
    : courses;
  const importCourses = importClassId
    ? (() => {
        const cls = classes.find((c) => String(c.id) === importClassId);
        return cls ? courses.filter((c) => c.departmentId === cls.departmentId) : [];
      })()
    : [];

  const updateRecordRow = (
    idx: number,
    field: "midExam" | "finalExam" | "project" | "assignment" | "presentation" | "totalMarks" | "grade" | "gradePoints",
    value: string | number
  ) => {
    setRecordClassData((prev) => {
      if (!prev) return prev;
      const rows = [...prev.rows];
      const r = rows[idx];
      if (!r) return prev;
      const rec = r.record ?? {
        midExam: 0, finalExam: 0, project: 0, assignment: 0, presentation: 0,
        totalMarks: 0, grade: "", gradePoints: 0,
      };
      const numVal = typeof value === "string" ? (value === "" ? 0 : parseFloat(value) || 0) : value;
      const strVal = typeof value === "string" ? value : String(value);
      const next = { ...rec };
      if (field === "grade") next.grade = strVal;
      else if (field === "gradePoints") next.gradePoints = numVal;
      else {
        next[field] = numVal;
        if (field !== "totalMarks") {
          next.totalMarks = next.midExam + next.finalExam + next.project + next.assignment + next.presentation;
        }
      }
      rows[idx] = { ...r, record: next };
      return { ...prev, rows };
    });
  };

  const handleSaveDraft = async () => {
    if (!recordClassId || !recordCourseId || !recordClassData) return;
    setRecordSaving(true);
    setRecordSaveResult(null);
    try {
      const payload = {
        classId: Number(recordClassId),
        courseId: Number(recordCourseId),
        status: "draft",
        records: recordClassData.rows.map((r) => ({
          studentId: r.student.id,
          ...(r.record ?? { midExam: 0, finalExam: 0, project: 0, assignment: 0, presentation: 0, totalMarks: 0, grade: "", gradePoints: 0 }),
        })),
      };
      const res = await authFetch("/api/examinations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setRecordSaveResult(`Saved as draft: ${data.created + data.updated} record(s) updated.`);
        const r = await authFetch(`/api/examinations/record-class?classId=${recordClassId}&courseId=${recordCourseId}`);
        if (r.ok) setRecordClassData(await r.json());
      } else {
        setRecordSaveResult(data.error || "Failed to save");
      }
    } catch {
      setRecordSaveResult("Network error");
    }
    setRecordSaving(false);
  };

  const handleApprove = async () => {
    if (!recordClassId || !recordCourseId || !recordClassData) return;
    if (!confirm("Are you sure you want to approve these exam records?")) return;
    setRecordSaving(true);
    setRecordSaveResult(null);
    try {
      const payload = {
        classId: Number(recordClassId),
        courseId: Number(recordCourseId),
        status: "approved",
        records: recordClassData.rows.map((r) => ({
          studentId: r.student.id,
          ...(r.record ?? { midExam: 0, finalExam: 0, project: 0, assignment: 0, presentation: 0, totalMarks: 0, grade: "", gradePoints: 0 }),
        })),
      };
      const res = await authFetch("/api/examinations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setRecordSaveResult(`Approved: ${data.created + data.updated} record(s) verified.`);
        const r = await authFetch(`/api/examinations/record-class?classId=${recordClassId}&courseId=${recordCourseId}`);
        if (r.ok) setRecordClassData(await r.json());
      } else {
        setRecordSaveResult(data.error || "Failed to approve");
      }
    } catch {
      setRecordSaveResult("Network error");
    }
    setRecordSaving(false);
  };

  const handleDownloadTemplate = async () => {
    if (!templateClassId || !templateCourseId) return;
    setTemplateLoading(true);
    setImportResult(null);
    try {
      const params = new URLSearchParams({ classId: templateClassId, courseId: templateCourseId });
      if (templateFacultyId) params.set("facultyId", templateFacultyId);
      if (templateDepartmentId) params.set("departmentId", templateDepartmentId);
      const res = await authFetch(`/api/examinations/template?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to download template");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^";\n]+)"?/);
      const filename = match ? match[1] : "Exam_Template.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download template");
    }
    setTemplateLoading(false);
  };

  const handleImportExcel = async () => {
    if (!importClassId || !importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("classId", importClassId);
      const res = await authFetch("/api/examinations/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Import failed");
        return;
      }
      setImportResult({ created: data.created, updated: data.updated, errors: data.errors });
      setImportFile(null);
    } catch {
      alert("Import failed");
    }
    setImportLoading(false);
  };

  const inputCellClass = "h-9 min-w-[3.5rem] rounded-md border border-gray-200 bg-white px-2 text-center text-sm outline-none transition focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90 dark:focus:border-brand-500";

  if (!hasPermission("examinations.create")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Record Exams" />
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/5">
          <p className="text-gray-500 dark:text-gray-400">You do not have permission to record exams.</p>
          <Link href="/examinations" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
            ← Back to Exam Records
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Record Exams" />

      <div className="mb-4 flex items-center justify-between">
        <Link href="/examinations" className="text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
          ← View Exam Records List
        </Link>
      </div>

      {/* Upload Form */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/5">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Upload Exam Records</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Download a template, fill in grades, then upload to import.</p>
        </div>
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end">
          <div className="flex flex-1 flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-white/2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">1</span>
              <span className="font-medium text-gray-800 dark:text-white/90">Download Template</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Faculty</label>
                <select value={templateFacultyId} onChange={(e) => { setTemplateFacultyId(e.target.value); setTemplateDepartmentId(""); setTemplateClassId(""); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">All Faculties</option>
                  {faculties.map((f) => <option key={f.id} value={f.id}>{f.code} - {f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Department</label>
                <select value={templateDepartmentId} onChange={(e) => { setTemplateDepartmentId(e.target.value); setTemplateClassId(""); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">All Departments</option>
                  {filteredDepartments.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
                <select value={templateClassId} onChange={(e) => { setTemplateClassId(e.target.value); setTemplateCourseId(""); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">Select Class</option>
                  {filteredClasses.map((c) => <option key={c.id} value={c.id}>{c.department?.code} - {c.name} ({c.semester} {c.year})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Course</label>
                <select value={templateCourseId} onChange={(e) => setTemplateCourseId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">Select Course</option>
                  {templateCourses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </div>
            </div>
            <Button size="sm" onClick={handleDownloadTemplate} disabled={!templateClassId || !templateCourseId || templateLoading}>
              <DownloadIcon className="mr-1.5 h-4 w-4" />
              {templateLoading ? "Downloading..." : "Download Template"}
            </Button>
          </div>
          <div className="flex flex-1 flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-white/2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">2</span>
              <span className="font-medium text-gray-800 dark:text-white/90">Import from Excel</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
                <select value={importClassId} onChange={(e) => { setImportClassId(e.target.value); setImportCourseId(""); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">Select Class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.department?.code} - {c.name} ({c.semester} {c.year})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Course</label>
                <select value={importCourseId} onChange={(e) => setImportCourseId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                  <option value="">Select Course</option>
                  {importCourses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Excel File</label>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 dark:border-gray-600 dark:bg-gray-800 dark:file:bg-brand-500/20 dark:file:text-brand-400" />
              </div>
            </div>
            <Button size="sm" onClick={handleImportExcel} disabled={!importClassId || !importFile || importLoading}>
              {importLoading ? "Importing..." : "Import from Excel"}
            </Button>
            {importResult && (
              <div className={`rounded-lg px-4 py-3 text-sm ${importResult.errors?.length ? "border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-500/10" : "border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-500/10"}`}>
                <p className={`font-medium ${importResult.errors?.length ? "text-amber-800 dark:text-amber-400" : "text-green-800 dark:text-green-400"}`}>
                  {importResult.errors?.length ? `${importResult.errors.length} error(s)` : `Imported: ${importResult.created} created, ${importResult.updated} updated`}
                </p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-300">View errors</summary>
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {importResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                      {importResult.errors.length > 5 && <li>... and {importResult.errors.length - 5} more</li>}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Grades Table */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/5">
        <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Record Exam Grades</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select Department and Class to enter grades directly. Save as draft, then approve when verified.</p>
        </div>
        <div className="p-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <div className="w-full sm:w-48">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Department</label>
              <select value={recordDepartmentId} onChange={(e) => { setRecordDepartmentId(e.target.value); setRecordClassId(""); setRecordCourseId(""); setRecordClassData(null); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                <option value="">Select Department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
              </select>
            </div>
            <div className="w-full sm:w-56">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Class</label>
              <select value={recordClassId} onChange={(e) => { setRecordClassId(e.target.value); setRecordCourseId(""); setRecordClassData(null); }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                <option value="">Select Class</option>
                {recordClasses.map((c) => <option key={c.id} value={c.id}>{c.department?.code} - {c.name} ({c.semester} {c.year})</option>)}
              </select>
            </div>
            <div className="w-full sm:w-56">
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">Course</label>
              <select value={recordCourseId} onChange={(e) => setRecordCourseId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90">
                <option value="">Select Course</option>
                {recordCourses.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
            {recordClassData && recordClassData.rows.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={recordSaving}>{recordSaving ? "Saving..." : "Save as Draft"}</Button>
                <Button size="sm" onClick={handleApprove} disabled={recordSaving}>{recordSaving ? "Saving..." : "Verify & Approve"}</Button>
              </div>
            )}
          </div>
          {recordSaveResult && (
            <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${recordSaveResult.startsWith("Saved") || recordSaveResult.startsWith("Approved") ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"}`}>
              {recordSaveResult}
            </div>
          )}
          {recordLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : recordClassData && recordClassData.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <Table>
                <TableHeader className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                  <TableRow>
                    <TableCell isHeader className="w-12 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">#</TableCell>
                    <TableCell isHeader className="min-w-[110px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">ID Card</TableCell>
                    <TableCell isHeader className="min-w-[180px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Student</TableCell>
                    <TableCell isHeader className="w-16 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300"><span title="Attendance % (Present+Excused)">Attend %</span></TableCell>
                    <TableCell isHeader className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Mid</TableCell>
                    <TableCell isHeader className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Asg2</TableCell>
                    <TableCell isHeader className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Asg1</TableCell>
                    <TableCell isHeader className="w-16 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Final</TableCell>
                    <TableCell isHeader className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Attend</TableCell>
                    <TableCell isHeader className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Total</TableCell>
                    <TableCell isHeader className="w-16 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">Grade</TableCell>
                    <TableCell isHeader className="w-16 px-2 py-3 text-center text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">GPA</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordClassData.rows.map((r, idx) => {
                    const rec = r.record ?? { midExam: 0, finalExam: 0, project: 0, assignment: 0, presentation: 0, totalMarks: 0, grade: "", gradePoints: 0 };
                    return (
                      <TableRow key={r.student.id} className="border-b border-gray-100 transition hover:bg-gray-50/50 dark:border-gray-800 dark:hover:bg-white/2">
                        <TableCell className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">{idx + 1}</TableCell>
                        <TableCell className="px-3 py-2 font-mono text-sm text-gray-800 dark:text-white/90">{r.student.studentId}</TableCell>
                        <TableCell className="px-3 py-2 text-sm font-medium text-gray-800 dark:text-white/90">{r.student.firstName} {r.student.lastName}</TableCell>
                        <TableCell className="px-3 py-2 text-center text-sm text-gray-600 dark:text-gray-400">
                          <span title="Attendance % (10% of grade)">{r.attendance != null ? `${r.attendance.attendancePercent}%` : "—"}</span>
                        </TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={20} step={0.5} value={rec.midExam || ""} onChange={(e) => updateRecordRow(idx, "midExam", e.target.value)} className={inputCellClass} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={10} step={0.5} value={rec.project || ""} onChange={(e) => updateRecordRow(idx, "project", e.target.value)} className={inputCellClass} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={10} step={0.5} value={rec.assignment || ""} onChange={(e) => updateRecordRow(idx, "assignment", e.target.value)} className={inputCellClass} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={40} step={0.5} value={rec.finalExam || ""} onChange={(e) => updateRecordRow(idx, "finalExam", e.target.value)} className={inputCellClass} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={10} step={0.5} value={rec.presentation || ""} onChange={(e) => updateRecordRow(idx, "presentation", e.target.value)} className={inputCellClass} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={100} step={0.5} value={rec.totalMarks || ""} onChange={(e) => updateRecordRow(idx, "totalMarks", e.target.value)} className={`${inputCellClass} font-semibold`} /></TableCell>
                        <TableCell className="p-2"><input type="text" value={rec.grade || ""} onChange={(e) => updateRecordRow(idx, "grade", e.target.value)} placeholder="A" className={inputCellClass} maxLength={3} /></TableCell>
                        <TableCell className="p-2"><input type="number" min={0} max={4} step={0.1} value={rec.gradePoints || ""} onChange={(e) => updateRecordRow(idx, "gradePoints", e.target.value)} className={inputCellClass} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : recordClassData && recordClassData.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">No students in this class.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Assign students to the class in Admission first.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
