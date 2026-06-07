"use client";

import React, { useEffect, useMemo, useState } from "react";
import Label from "./Label";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/** Max day when year not chosen yet (Feb → 29 so leap years still possible once year is set). */
function dayCapWithoutYear(month: number): number {
  if (month === 2) return 29;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function parseYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(mo, y)) return null;
  return { y, m: mo, d };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type DateOfBirthSplitFieldsProps = {
  /** YYYY-MM-DD or empty */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  idPrefix?: string;
};

const selectClass =
  "mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2.5 text-sm dark:border-gray-700 dark:text-white";

/**
 * Date of birth as three selects: Month, Day, Year (left to right).
 */
export default function DateOfBirthSplitFields({
  value,
  onChange,
  label = "Date of birth",
  required = false,
  idPrefix = "dob",
}: DateOfBirthSplitFieldsProps) {
  const now = useMemo(() => new Date(), []);
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curD = now.getDate();

  const minYear = 1900;

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = curY; y >= minYear; y--) out.push(y);
    return out;
  }, [curY]);

  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    const p = parseYmd(value);
    setMonth(p ? String(p.m) : "");
    setDay(p ? String(p.d) : "");
    setYear(p ? String(p.y) : "");
  }, [value]);

  const yNum = year ? Number(year) : null;
  const mNum = month ? Number(month) : null;

  const monthCap = yNum === curY ? curM : 12;

  const dayCap =
    yNum != null && mNum != null
      ? yNum === curY && mNum === curM
        ? Math.min(daysInMonth(mNum, yNum), curD)
        : daysInMonth(mNum, yNum)
      : mNum != null
        ? dayCapWithoutYear(mNum)
        : 31;

  function commit(yStr: string, mStr: string, dStr: string) {
    if (!yStr || !mStr || !dStr) {
      onChange("");
      return;
    }
    const yi = Number(yStr);
    const mi = Number(mStr);
    let di = Number(dStr);
    const maxD =
      yi === curY && mi === curM
        ? Math.min(daysInMonth(mi, yi), curD)
        : daysInMonth(mi, yi);
    if (di > maxD) di = maxD;
    if (di < 1) {
      onChange("");
      return;
    }
    onChange(`${yi}-${pad2(mi)}-${pad2(di)}`);
  }

  return (
    <div>
      {label ? (
        <Label className="mb-1.5">
          {label}
          {required ? <span className="text-error-500"> *</span> : null}
        </Label>
      ) : null}
      <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={`${idPrefix}-month`} className="sr-only">
            Month
          </label>
          <select
            id={`${idPrefix}-month`}
            required={required}
            aria-required={required}
            value={month}
            onChange={(e) => {
              const v = e.target.value;
              setMonth(v);
              if (!v) {
                onChange("");
                return;
              }
              const mi = Number(v);
              if (yNum === curY && mi > curM) {
                setMonth(String(curM));
                if (year && day) commit(year, String(curM), day);
                else onChange("");
                return;
              }
              let nextDay = day;
              if (nextDay) {
                const cap =
                  yNum != null
                    ? yNum === curY && mi === curM
                      ? Math.min(daysInMonth(mi, yNum), curD)
                      : daysInMonth(mi, yNum)
                    : dayCapWithoutYear(mi);
                if (Number(nextDay) > cap) nextDay = String(cap);
                setDay(nextDay);
              }
              if (year && nextDay) commit(year, v, nextDay);
              else onChange("");
            }}
            className={selectClass}
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((name, i) => {
              const mo = i + 1;
              if (yNum === curY && mo > monthCap) return null;
              return (
                <option key={mo} value={String(mo)}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-day`} className="sr-only">
            Day
          </label>
          <select
            id={`${idPrefix}-day`}
            required={required}
            aria-required={required}
            value={day}
            onChange={(e) => {
              const v = e.target.value;
              setDay(v);
              if (!v || !year || !month) {
                onChange("");
                return;
              }
              commit(year, month, v);
            }}
            className={selectClass}
          >
            <option value="">Day</option>
            {Array.from({ length: dayCap }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-year`} className="sr-only">
            Year
          </label>
          <select
            id={`${idPrefix}-year`}
            required={required}
            aria-required={required}
            value={year}
            onChange={(e) => {
              const v = e.target.value;
              setYear(v);
              if (!v) {
                onChange("");
                return;
              }
              const yi = Number(v);
              let nextM = month;
              let nextD = day;
              if (yi === curY) {
                if (nextM && Number(nextM) > curM) {
                  nextM = String(curM);
                  setMonth(nextM);
                }
              }
              if (nextM && nextD) {
                const mi = Number(nextM);
                const maxD =
                  yi === curY && mi === curM
                    ? Math.min(daysInMonth(mi, yi), curD)
                    : daysInMonth(mi, yi);
                if (Number(nextD) > maxD) {
                  nextD = String(maxD);
                  setDay(nextD);
                }
              }
              if (nextM && nextD) commit(v, nextM, nextD);
              else onChange("");
            }}
            className={selectClass}
          >
            <option value="">Year</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
