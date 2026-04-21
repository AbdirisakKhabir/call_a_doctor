"use client";

import Label from "@/components/form/Label";
import { calculateAgeFromIsoDateString } from "@/lib/age-from-dob";

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm tabular-nums text-gray-800 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white";

/** Read-only age (years) derived from YYYY-MM-DD or ISO date string; updates when `dateOfBirth` changes. */
export default function AgeReadonlyInput({
  dateOfBirth,
  idSuffix = "field",
}: {
  dateOfBirth: string;
  /** Unique fragment for `id` when multiple age fields exist on one page. */
  idSuffix?: string;
}) {
  const age = calculateAgeFromIsoDateString(dateOfBirth);
  const id = `patient-age-${idSuffix}`;
  return (
    <div>
      <Label htmlFor={id}>Age</Label>
      <input
        id={id}
        readOnly
        tabIndex={-1}
        value={age !== null ? String(age) : ""}
        placeholder="—"
        className={`${inputClass} cursor-default`}
        aria-live="polite"
        aria-label="Age in years, from date of birth"
      />
    </div>
  );
}
