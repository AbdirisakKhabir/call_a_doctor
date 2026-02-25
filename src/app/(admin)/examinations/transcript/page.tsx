"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TranscriptDocument } from "@/components/transcript/TranscriptDocument";

type Department = { id: number; name: string; code: string };
type ClassItem = {
  id: number;
  name: string;
  semester: string;
  year: number;
  course: { code: string; name: string; department?: { id: number } };
};
type StudentItem = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  department: { id: number; name: string; code: string };
  class?: { id: number; name: string; semester: string; year: number; course: { code: string } };
};
type ExamRecord = {
  id: number;
  semester: string;
  year: number;
  totalMarks: number;
  grade: string | null;
  gradePoints: number | null;
  course: { code: string; name: string; creditHours: number };
};
type SemesterGPA = {
  semester: string;
  year: number;
  gpa: number;
  totalCredits: number;
  totalGradePoints: number;
  courses: number;
};
type TranscriptData = {
  student: {
    id: number;
    studentId: string;
    firstName: string;
    lastName: string;
    admissionDate?: string;
    department?: {
      id: number;
      name: string;
      code: string;
      faculty?: { id: number; name: string; code: string };
    };
  };
  records: ExamRecord[];
  gpa: {
    cumulativeGPA: number;
    totalCredits: number;
    semesters: SemesterGPA[];
  };
};

type ClassTranscriptData = {
  class: { id: number; name: string; semester: string; year: number; course: { code: string; name: string } };
  transcripts: TranscriptData[];
};

type TranscriptMode = "student" | "class";

export default function TranscriptPage() {
  const { hasPermission } = useAuth();
  const [mode, setMode] = useState<TranscriptMode>("student");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [filterDept, setFilterDept] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [classTranscript, setClassTranscript] = useState<ClassTranscriptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  const fetchDepartments = useCallback(async () => {
    const res = await authFetch("/api/departments");
    if (res.ok) setDepartments(await res.json());
  }, []);

  const fetchClasses = useCallback(async () => {
    const res = await authFetch("/api/classes");
    if (res.ok) setClasses(await res.json());
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDept) params.set("departmentId", filterDept);
      if (filterClass) params.set("classId", filterClass);
      const res = await authFetch(`/api/transcript/students?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
        if (!filterStudent || !data.some((s: StudentItem) => String(s.id) === filterStudent)) {
          setFilterStudent("");
        }
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [filterDept, filterClass]);

  const fetchTranscript = useCallback(async () => {
    if (!filterStudent) {
      setTranscript(null);
      return;
    }
    setLoadingTranscript(true);
    setTranscript(null);
    setClassTranscript(null);
    try {
      const res = await authFetch(`/api/examinations/gpa?studentId=${filterStudent}`);
      if (res.ok) {
        const data = await res.json();
        setTranscript(data);
      }
    } catch { /* empty */ }
    setLoadingTranscript(false);
  }, [filterStudent]);

  const fetchClassTranscript = useCallback(async () => {
    if (!filterClass) {
      setClassTranscript(null);
      return;
    }
    setLoadingTranscript(true);
    setTranscript(null);
    setClassTranscript(null);
    try {
      const res = await authFetch(`/api/transcript/class?classId=${filterClass}`);
      if (res.ok) {
        const data = await res.json();
        setClassTranscript(data);
      }
    } catch { /* empty */ }
    setLoadingTranscript(false);
  }, [filterClass]);

  useEffect(() => {
    fetchDepartments();
    fetchClasses();
  }, [fetchDepartments, fetchClasses]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    if (mode === "student") {
      fetchTranscript();
    } else {
      fetchClassTranscript();
    }
  }, [mode, fetchTranscript, fetchClassTranscript]);

  const filteredClasses = filterDept
    ? classes.filter((c) => c.course?.department?.id === Number(filterDept))
    : classes;

  const handlePrint = () => window.print();

  // Group records by semester (year + semester)
  const recordsBySemester = transcript
    ? transcript.records.reduce<Record<string, ExamRecord[]>>((acc, r) => {
        const key = `${r.year}-${r.semester}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {})
    : {};

  // Sort semester keys chronologically (oldest first: year asc, then Spring→Summer→Fall)
  const semOrder: Record<string, number> = { Spring: 1, Summer: 2, Fall: 3 };
  const semesterKeys = Object.keys(recordsBySemester).sort((a, b) => {
    const [ay, as] = a.split("-");
    const [by, bs] = b.split("-");
    const yearDiff = Number(ay) - Number(by);
    if (yearDiff !== 0) return yearDiff;
    return (semOrder[as] ?? 0) - (semOrder[bs] ?? 0);
  });

  const canView =
    hasPermission("examinations.view") ||
    hasPermission("reports.view") ||
    hasPermission("examinations.edit");

  if (!canView) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        <p className="text-gray-500 dark:text-gray-400">You do not have permission to view transcripts.</p>
      </div>
    );
  }

  const hasTranscript = transcript || classTranscript;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 no-print">
        <PageBreadCrumb pageTitle="Transcript" />
        {hasTranscript && (
          <Button size="sm" onClick={handlePrint}>
            Print Transcript
          </Button>
        )}
      </div>


      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/5">
        <div className="no-print border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">Filters</h3>
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("student");
                setTranscript(null);
                setClassTranscript(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === "student"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              One Student
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("class");
                setTranscript(null);
                setClassTranscript(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === "class"
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              One Class
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Department</label>
              <select
                value={filterDept}
                onChange={(e) => {
                  setFilterDept(e.target.value);
                  setFilterClass("");
                  setFilterStudent("");
                }}
                className="h-10 min-w-[180px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Class</label>
              <select
                value={filterClass}
                onChange={(e) => {
                  setFilterClass(e.target.value);
                  if (mode === "student") setFilterStudent("");
                }}
                className="h-10 min-w-[200px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
              >
                <option value="">Select Class</option>
                {filteredClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.course?.code} - {c.name} ({c.semester} {c.year})
                  </option>
                ))}
              </select>
            </div>
            {mode === "student" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Student</label>
                <select
                  value={filterStudent}
                  onChange={(e) => setFilterStudent(e.target.value)}
                  className="h-10 min-w-[220px] rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-300 dark:border-gray-700 dark:text-white/80"
                >
                  <option value="">Select Student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentId} - {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {loadingTranscript ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : mode === "student" && !filterStudent ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a student to view their transcript.
            </div>
          ) : mode === "class" && !filterClass ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a class to view transcripts for all students in that class.
            </div>
          ) : mode === "student" && !transcript ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No transcript data found for this student.
            </div>
          ) : mode === "class" && !classTranscript ? (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No transcript data found for this class.
            </div>
          ) : classTranscript ? (
            /* Class transcript: all students */
            classTranscript.transcripts.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                No students in this class.
              </div>
            ) : (
            <div className="space-y-10">
              {classTranscript.transcripts.map((t, idx) => {
                const recBySem = t.records.reduce<Record<string, ExamRecord[]>>((acc, r) => {
                  const key = `${r.year}-${r.semester}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(r);
                  return acc;
                }, {});
                const keys = Object.keys(recBySem).sort((a, b) => {
                  const [ay, as] = a.split("-");
                  const [by, bs] = b.split("-");
                  const yd = Number(ay) - Number(by);
                  if (yd !== 0) return yd;
                  return (semOrder[as] ?? 0) - (semOrder[bs] ?? 0);
                });
                const semGpaMap = t.gpa.semesters.reduce<Record<string, SemesterGPA>>(
                  (acc, s) => {
                    acc[`${s.year}-${s.semester}`] = s;
                    return acc;
                  },
                  {}
                );
                return (
                  <div key={t.student.id} className={idx > 0 ? "break-before-page" : ""}>
                    <TranscriptDocument
                      student={t.student}
                      recordsBySemester={recBySem}
                      semesterKeys={keys}
                      semGpaMap={semGpaMap}
                      cumulativeGPA={t.gpa.cumulativeGPA}
                      totalCredits={t.gpa.totalCredits}
                    />
                  </div>
                );
              })}
            </div>
            )
          ) : transcript ? (
            <TranscriptDocument
              student={transcript.student}
              recordsBySemester={recordsBySemester}
              semesterKeys={semesterKeys}
              semGpaMap={transcript.gpa.semesters.reduce<Record<string, SemesterGPA>>(
                (acc, s) => {
                  acc[`${s.year}-${s.semester}`] = s;
                  return acc;
                },
                {}
              )}
              cumulativeGPA={transcript.gpa.cumulativeGPA}
              totalCredits={transcript.gpa.totalCredits}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
