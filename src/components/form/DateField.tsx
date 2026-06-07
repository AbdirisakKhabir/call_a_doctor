"use client";

import React, { useEffect, useId, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import Label from "./Label";
import { CalenderIcon } from "@/icons";
import type { Instance } from "flatpickr/dist/types/instance";

export type DateFieldProps = {
  /** YYYY-MM-DD or empty */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** When true, calendar is appended to document.body (avoids clipping in modals/dropdowns) */
  appendToBody?: boolean;
  className?: string;
};

/**
 * Single-date picker (Flatpickr) — consistent calendar selection across the app.
 */
export default function DateField({
  value,
  onChange,
  label,
  id,
  min,
  max,
  required,
  disabled,
  placeholder = "Select date",
  appendToBody = true,
  className = "",
}: DateFieldProps) {
  const reactId = useId();
  const inputId = id ?? `date-field-${reactId.replace(/:/g, "")}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const fp = flatpickr(el, {
      dateFormat: "Y-m-d",
      defaultDate: value || undefined,
      minDate: min || undefined,
      maxDate: max || undefined,
      disableMobile: true,
      appendTo: appendToBody ? document.body : undefined,
      static: !appendToBody,
      clickOpens: !disabled,
      onChange: (_dates, dateStr) => {
        onChangeRef.current(dateStr || "");
      },
    });
    fpRef.current = fp;

    return () => {
      fp.destroy();
      fpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; sync via effects below
  }, []);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    const current = fp.input.value;
    if (!value) {
      if (current) fp.clear();
      return;
    }
    if (current !== value) {
      fp.setDate(value, false, "Y-m-d");
    }
  }, [value]);

  useEffect(() => {
    fpRef.current?.set("minDate", min || undefined);
  }, [min]);

  useEffect(() => {
    fpRef.current?.set("maxDate", max || undefined);
  }, [max]);

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
          <CalenderIcon className="size-5" />
        </span>
      </div>
    </div>
  );
}
