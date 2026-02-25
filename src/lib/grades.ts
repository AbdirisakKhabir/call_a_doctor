// Grade scale for Abaarso Tech University
// Mark breakdown (default max marks):
//   Mid Exam:      /20
//   Final Exam:    /40
//   Assessment:    /10
//   Project:       /10
//   Assignment:    /10
//   Presentation:  /10
//   Total:         /100

export interface GradeInfo {
  grade: string;
  gradePoints: number;
}

export const GRADE_SCALE: { min: number; grade: string; points: number }[] = [
  { min: 90, grade: "A",  points: 4.0 },
  { min: 85, grade: "A-", points: 3.7 },
  { min: 80, grade: "B+", points: 3.3 },
  { min: 75, grade: "B",  points: 3.0 },
  { min: 70, grade: "B-", points: 2.7 },
  { min: 65, grade: "C+", points: 2.3 },
  { min: 60, grade: "C",  points: 2.0 },
  { min: 50, grade: "D",  points: 1.0 },
  { min: 0,  grade: "F",  points: 0.0 },
];

export const MARK_COMPONENTS = [
  { key: "midExam",      label: "Mid Exam",      maxMarks: 20 },
  { key: "finalExam",    label: "Final Exam",     maxMarks: 40 },
  { key: "assessment",   label: "Assessment",     maxMarks: 10 },
  { key: "project",      label: "Project",        maxMarks: 10 },
  { key: "assignment",   label: "Assignment",     maxMarks: 10 },
  { key: "presentation", label: "Presentation",   maxMarks: 10 },
] as const;

export function calculateTotal(marks: {
  midExam?: number | null;
  finalExam?: number | null;
  assessment?: number | null;
  project?: number | null;
  assignment?: number | null;
  presentation?: number | null;
}): number {
  return (
    (marks.midExam || 0) +
    (marks.finalExam || 0) +
    (marks.assessment || 0) +
    (marks.project || 0) +
    (marks.assignment || 0) +
    (marks.presentation || 0)
  );
}

export function getGradeInfo(totalMarks: number): GradeInfo {
  for (const g of GRADE_SCALE) {
    if (totalMarks >= g.min) {
      return { grade: g.grade, gradePoints: g.points };
    }
  }
  return { grade: "F", gradePoints: 0.0 };
}

/** Parse grade letter (A, B+, F, etc.) to grade points. Returns null if unknown. */
export function getGradePointsFromGrade(gradeStr: string): number | null {
  const normalized = String(gradeStr || "").trim().toUpperCase();
  const entry = GRADE_SCALE.find((g) => g.grade.toUpperCase() === normalized);
  return entry ? entry.points : null;
}

export interface SemesterGPA {
  semester: string;
  year: number;
  gpa: number;
  totalCredits: number;
  totalGradePoints: number;
  courses: number;
}

export interface GPASummary {
  cumulativeGPA: number;
  totalCredits: number;
  semesters: SemesterGPA[];
}

/** Optional map of semester name -> sort order (from Semester table). If not provided, uses default. */
export function calculateGPA(
  records: {
    semester: string;
    year: number;
    gradePoints: number | null;
    creditHours: number;
  }[],
  semOrderMap?: Record<string, number>
): GPASummary {
  // Group by semester+year
  const semMap = new Map<string, { semester: string; year: number; items: { gradePoints: number; creditHours: number }[] }>();

  for (const r of records) {
    const key = `${r.semester}-${r.year}`;
    if (!semMap.has(key)) {
      semMap.set(key, { semester: r.semester, year: r.year, items: [] });
    }
    semMap.get(key)!.items.push({
      gradePoints: r.gradePoints || 0,
      creditHours: r.creditHours,
    });
  }

  const semesters: SemesterGPA[] = [];
  let cumulativeTotalCredits = 0;
  let cumulativeTotalGradePoints = 0;

  // Sort semesters by year then semester (use semOrderMap from DB, or fallback)
  const semOrder: Record<string, number> = semOrderMap ?? { Spring: 1, Summer: 2, Fall: 3 };
  const sorted = [...semMap.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return (semOrder[a.semester] || 0) - (semOrder[b.semester] || 0);
  });

  for (const sem of sorted) {
    let totalCredits = 0;
    let totalGradePoints = 0;
    for (const item of sem.items) {
      totalCredits += item.creditHours;
      totalGradePoints += item.gradePoints * item.creditHours;
    }
    const gpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;
    semesters.push({
      semester: sem.semester,
      year: sem.year,
      gpa: Math.round(gpa * 100) / 100,
      totalCredits,
      totalGradePoints: Math.round(totalGradePoints * 100) / 100,
      courses: sem.items.length,
    });
    cumulativeTotalCredits += totalCredits;
    cumulativeTotalGradePoints += totalGradePoints;
  }

  const cumulativeGPA =
    cumulativeTotalCredits > 0
      ? Math.round((cumulativeTotalGradePoints / cumulativeTotalCredits) * 100) / 100
      : 0;

  return {
    cumulativeGPA,
    totalCredits: cumulativeTotalCredits,
    semesters,
  };
}
