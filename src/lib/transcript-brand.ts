/**
 * University transcript brand configuration.
 * Customize these values to match your institution.
 */
export const TRANSCRIPT_BRAND = {
  universityName: "Abaarso Tech University",
  officeTitle: "Office of the Registrar",
  documentTitle: "Student's Cumulative Record and Partial Transcript",
  email: "registrar@abaarsotech.edu",
  website: "www.abaarsotech.edu",
  logoUrl: "/logo/logo%20abaarso.png",
  semesterHeaderBg: "#d4edda", // Light green for Academic Year / Semester bands
  semesterHeaderText: "#155724",
  failGradeBg: "#fff3cd", // Yellow highlight for failing grades
  failGradeText: "#856404",
} as const;

/** Grading system legend - matches GRADE_SCALE in lib/grades.ts */
export const GRADING_SYSTEM_LEGEND = [
  { range: "90-100", grade: "A" },
  { range: "85-89", grade: "A-" },
  { range: "80-84", grade: "B+" },
  { range: "75-79", grade: "B" },
  { range: "70-74", grade: "B-" },
  { range: "65-69", grade: "C+" },
  { range: "60-64", grade: "C" },
  { range: "50-59", grade: "D" },
  { range: "Below 50", grade: "F" },
];
