"use client";

import React, { useEffect, useId, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import Label from "./Label";
import { TimeIcon } from "@/icons";
import type { Instance } from "flatpickr/dist/types/instance";

export type TimeFieldProps = {
  /** HH:mm (24h), e.g. 09:00 */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** When true, picker is appended to document.body (avoids clipping in modals) */
  appendToBody?: boolean;
  /** Step between minute choices (default 15, matches calendar slots) */
  minuteIncrement?: number;
  className?: string;
};

function hhmmToDate(hhmm: string): Date | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return undefined;
  }
  return new Date(2000, 0, 1, h, min, 0, 0);
}

function normalizeFlatpickrHhmm(dateStr: string): string {
  const s = dateStr.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return s.slice(0, 5);
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Time-only picker (Flatpickr) — scroll / tap selection for blocked-hour ranges.
 */
export default function TimeField({
  value,
  onChange,
  label,
  id,
  required,
  disabled,
  placeholder = "Select time",
  appendToBody = true,
  minuteIncrement = 15,
  className = "",
}: TimeFieldProps) {
  const reactId = useId();
  const inputId = id ?? `time-field-${reactId.replace(/:/g, "")}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const fp = flatpickr(el, {
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      time_24hr: true,
      minuteIncrement,
      defaultDate: value ? hhmmToDate(value) : undefined,
      disableMobile: true,
      appendTo: appendToBody ? document.body : undefined,
      static: !appendToBody,
      clickOpens: !disabled,
      onChange: (_dates, dateStr) => {
        const raw = dateStr || "";
        onChangeRef.current(raw ? normalizeFlatpickrHhmm(raw) : "");
      },
    });
    fpRef.current = fp;

    return () => {
      fp.destroy();
      fpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    if (!value) {
      if (fp.selectedDates.length) fp.clear();
      return;
    }
    const d = hhmmToDate(value);
    if (!d) return;
    const cur = fp.selectedDates[0];
    if (
      !cur ||
      cur.getHours() !== d.getHours() ||
      cur.getMinutes() !== d.getMinutes()
    ) {
      fp.setDate(d, false);
    }
  }, [value]);

  useEffect(() => {
    fpRef.current?.set("clickOpens", !disabled);
  }, [disabled]);

  const inputClass =
    "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 pr-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 " +
    className;

  return (
    <div>
      {label ? (
        <Label htmlFor={inputId} className="mb-1.5">
          {label}
        </Label>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          disabled={disabled}
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          className={inputClass}
          aria-required={required}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          <TimeIcon className="size-5" />
        </span>
      </div>
    </div>
  );
}
