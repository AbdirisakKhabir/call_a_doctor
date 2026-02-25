"use client";

import React from "react";
import { TRANSCRIPT_BRAND, GRADING_SYSTEM_LEGEND } from "@/lib/transcript-brand";

type ExamRecord = {
  id: number;
  semester: string;
  year: number;
  totalMarks: number;
  grade: string | null;
  gradePoints: number | null;
  course: { code: string; name: string; creditHours: number };
};

type StudentInfo = {
  id: number;
  studentId: string;
  firstName: string;
  lastName: string;
  admissionDate?: string | Date;
  department?: {
    id: number;
    name: string;
    code: string;
    faculty?: { id: number; name: string; code: string };
  };
};

type SemesterGPA = {
  semester: string;
  year: number;
  gpa: number;
  totalCredits: number;
  totalGradePoints: number;
  courses: number;
};

type TranscriptDocumentProps = {
  student: StudentInfo;
  recordsBySemester: Record<string, ExamRecord[]>;
  semesterKeys: string[];
  semGpaMap: Record<string, SemesterGPA>;
  cumulativeGPA: number;
  totalCredits: number;
  semOrder?: Record<string, number>;
};

export function TranscriptDocument({
  student,
  recordsBySemester,
  semesterKeys,
  semGpaMap,
  cumulativeGPA,
  totalCredits,
}: TranscriptDocumentProps) {
  const college = student.department?.faculty?.name ?? "—";
  const department = student.department?.name ?? "—";
  const studentName = `${student.firstName} ${student.lastName}`;
  const entryYear = student.admissionDate
    ? new Date(student.admissionDate).getFullYear()
    : "—";

  return (
    <div className="transcript-document mx-auto max-w-[210mm] bg-white px-6 py-4 text-gray-900 print:px-6 print:py-4 print:text-[11px]">
      {/* Header - centered, larger */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="relative mb-3 h-20 w-20 overflow-hidden rounded-full bg-gray-50 print:h-16 print:w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={TRANSCRIPT_BRAND.logoUrl}
            alt="University logo"
            className="h-full w-full object-contain p-2"
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 print:text-xl">
          {TRANSCRIPT_BRAND.universityName}
        </h1>
        <p className="mt-1 text-sm text-gray-600 print:text-xs">
          E-mail: {TRANSCRIPT_BRAND.email} &nbsp;•&nbsp; Website: {TRANSCRIPT_BRAND.website}
        </p>
        <p className="mt-2 text-sm font-semibold text-gray-700 print:text-xs">
          {TRANSCRIPT_BRAND.officeTitle}
        </p>
        <h2 className="mt-3 text-base font-bold text-gray-800 print:text-sm">
          {TRANSCRIPT_BRAND.documentTitle}
        </h2>
      </div>

      {/* Student info + Grading system - with borders */}
      <div className="mb-3 flex gap-4">
        <table
          className="transcript-table flex-1 border border-gray-900 text-[11px] print:text-[10px]"
          style={{ borderCollapse: "collapse" }}
        >
          <tbody>
            <tr>
              <td className="border border-gray-900 bg-gray-100 px-2 py-0.5 font-semibold w-24">
                College
              </td>
              <td className="border border-gray-900 px-2 py-0.5">{college}</td>
            </tr>
            <tr>
              <td className="border border-gray-900 bg-gray-100 px-2 py-0.5 font-semibold">
                Department
              </td>
              <td className="border border-gray-900 px-2 py-0.5">{department}</td>
            </tr>
            <tr>
              <td className="border border-gray-900 bg-gray-100 px-2 py-0.5 font-semibold">
                Student Name
              </td>
              <td className="border border-gray-900 px-2 py-0.5">{studentName}</td>
            </tr>
            <tr>
              <td className="border border-gray-900 bg-gray-100 px-2 py-0.5 font-semibold">
                Student ID
              </td>
              <td className="border border-gray-900 px-2 py-0.5 font-mono">
                {student.studentId}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-900 bg-gray-100 px-2 py-0.5 font-semibold">
                Entry Year
              </td>
              <td className="border border-gray-900 px-2 py-0.5">{entryYear}</td>
            </tr>
          </tbody>
        </table>

        <table
          className="transcript-table w-40 shrink-0 border border-gray-900 text-[10px] print:text-[9px]"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th
                colSpan={2}
                className="border border-gray-900 bg-gray-100 px-1.5 py-0.5 text-left font-semibold"
              >
                Grading System
              </th>
            </tr>
          </thead>
          <tbody>
            {GRADING_SYSTEM_LEGEND.map(({ range, grade }) => (
              <tr key={grade}>
                <td className="border border-gray-900 px-1.5 py-px">{range}</td>
                <td className="border border-gray-900 px-1.5 py-px font-medium">
                  {grade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Semesters - each separate with green bands */}
      {semesterKeys.map((key, keyIdx) => {
        const [year, semester] = key.split("-");
        const records = recordsBySemester[key] || [];
        const semGpa = semGpaMap[key];
        const prevKeys = semesterKeys.slice(0, keyIdx);
        let cumCredits = 0;
        let cumHpts = 0;
        for (const pk of prevKeys) {
          const pr = recordsBySemester[pk] || [];
          for (const r of pr) {
            cumCredits += r.course.creditHours;
            cumHpts += r.course.creditHours * (r.gradePoints ?? 0);
          }
        }
        const thisSemCredits = records.reduce(
          (s, r) => s + r.course.creditHours,
          0
        );
        const thisSemHpts = records.reduce(
          (s, r) => s + r.course.creditHours * (r.gradePoints ?? 0),
          0
        );
        const totalCreditsSoFar = cumCredits + thisSemCredits;
        const totalHptsSoFar = cumHpts + thisSemHpts;
        const cgpa =
          totalCreditsSoFar > 0
            ? Math.round((totalHptsSoFar / totalCreditsSoFar) * 100) / 100
            : 0;

        return (
          <div key={key} className="mb-3">
            {/* Academic Year band */}
            <div
              className="px-2 py-1 font-semibold text-[11px] print:text-[10px]"
              style={{
                backgroundColor: TRANSCRIPT_BRAND.semesterHeaderBg,
                color: TRANSCRIPT_BRAND.semesterHeaderText,
              }}
            >
              Academic Year: {Number(year) - 1}-{year}
            </div>
            {/* Semester band */}
            <div
              className="ml-3 px-2 py-0.5 font-medium text-[11px] print:text-[10px]"
              style={{
                backgroundColor: TRANSCRIPT_BRAND.semesterHeaderBg,
                color: TRANSCRIPT_BRAND.semesterHeaderText,
              }}
            >
              Semester: {semester} {year}
            </div>

            {/* Course table - with borders */}
            <table
              className="transcript-table mt-1 w-full border border-gray-900 text-[11px] print:text-[10px]"
              style={{ borderCollapse: "collapse" }}
            >
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-900 px-1.5 py-0.5 text-left font-semibold">
                    Course Code
                  </th>
                  <th className="border border-gray-900 px-1.5 py-0.5 text-left font-semibold">
                    Course Title
                  </th>
                  <th className="border border-gray-900 px-1 py-0.5 text-center font-semibold w-10">
                    CrHrs
                  </th>
                  <th className="border border-gray-900 px-1 py-0.5 text-center font-semibold w-12">
                    Marks
                  </th>
                  <th className="border border-gray-900 px-1 py-0.5 text-center font-semibold w-10">
                    Letter
                  </th>
                  <th className="border border-gray-900 px-1 py-0.5 text-center font-semibold w-10">
                    QPE
                  </th>
                  <th className="border border-gray-900 px-1 py-0.5 text-center font-semibold w-10">
                    Hpts
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const hpts = r.course.creditHours * (r.gradePoints ?? 0);
                  const isFail = (r.grade || "").toUpperCase() === "F";
                  return (
                    <tr key={r.id} className="transcript-row">
                      <td className="border border-gray-900 px-1.5 py-0.5 font-mono">
                        {r.course.code}
                      </td>
                      <td className="border border-gray-900 px-1.5 py-0.5">
                        {r.course.name}
                      </td>
                      <td className="border border-gray-900 px-1 py-0.5 text-center">
                        {r.course.creditHours}
                      </td>
                      <td
                        className="border border-gray-900 px-1 py-0.5 text-center"
                        style={
                          isFail
                            ? {
                                backgroundColor: TRANSCRIPT_BRAND.failGradeBg,
                                color: TRANSCRIPT_BRAND.failGradeText,
                              }
                            : undefined
                        }
                      >
                        {r.totalMarks.toFixed(2)}
                      </td>
                      <td
                        className="border border-gray-900 px-1 py-0.5 text-center font-semibold"
                        style={
                          isFail
                            ? {
                                backgroundColor: TRANSCRIPT_BRAND.failGradeBg,
                                color: TRANSCRIPT_BRAND.failGradeText,
                              }
                            : undefined
                        }
                      >
                        {r.grade || "—"}
                      </td>
                      <td className="border border-gray-900 px-1 py-0.5 text-center">
                        {r.gradePoints != null
                          ? r.gradePoints.toFixed(2)
                          : "0.00"}
                      </td>
                      <td className="border border-gray-900 px-1 py-0.5 text-center">
                        {hpts.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Semester totals */}
            <div className="mt-1 flex gap-4 text-[11px] print:text-[10px]">
              <span>
                Total CrHrs:{" "}
                <strong>
                  {records.reduce(
                    (s, r) => s + r.course.creditHours,
                    0
                  )}
                </strong>
              </span>
              <span>
                Total Hpts: <strong>{thisSemHpts.toFixed(2)}</strong>
              </span>
              <span>
                GPA: <strong>{semGpa?.gpa.toFixed(2) ?? "0.00"}</strong>
              </span>
              {keyIdx > 0 && (
                <span>
                  CGPA: <strong>{cgpa.toFixed(2)}</strong>
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Final CGPA */}
      <div className="mt-3 border-t border-gray-200 pt-2">
        <p className="text-[11px] font-semibold print:text-[10px]">
          Cumulative GPA:{" "}
          <span className="text-sm">{cumulativeGPA.toFixed(2)}</span>
        </p>
        <p className="text-[10px] text-gray-600 print:text-[9px]">
          Total Credits: {totalCredits}
        </p>
        <p className="mt-1 text-[10px] text-gray-500 print:text-[9px]">
          Generated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
