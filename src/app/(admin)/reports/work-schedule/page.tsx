"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatWorkingDaysPlainEnglish } from "@/lib/hr-staff";

type StaffRow = {
  id: number;
  name: string;
  phone: string;
  title: string;
  workingDays: string;
  workingHours: string;
  isActive: boolean;
  hireDate: string;
};

function formatReportDate() {
  return new Date().toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default function WorkScheduleReportPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("hr.view");

  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<StaffRow[]>([]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const q = activeOnly ? "?activeOnly=1" : "";
      const res = await authFetch(`/api/hr/staff${q}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView, activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  function handlePrint() {
    window.print();
  }

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Work schedule report" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to view this report.</p>
      </div>
    );
  }

  return (
    <div className="work-schedule-report-wrap">
      <div className="mb-6 flex flex-col gap-4 print:mb-4 sm:flex-row sm:items-start sm:justify-between">
        <PageBreadCrumb pageTitle="Team work schedule" />
        <div className="no-print flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
            Print / Save as PDF
          </Button>
          <Link href="/hr/staff">
            <Button type="button" variant="outline" size="sm">
              Staff list
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/20 print:border-gray-300 print:shadow-none">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white print:text-black">
          When our team is scheduled to work
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400 print:text-gray-800">
          This report is written so <strong>staff</strong> and <strong>clients</strong> can see, at a glance, which days each
          team member works and what hours they keep. Use it for reception handouts, internal planning, or answering
          &quot;Who is in on …?&quot; Phone numbers are included so clients can reach the right person when appropriate.
        </p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-500 print:text-gray-600">
          Report generated: <span className="tabular-nums">{formatReportDate()}</span>
          {activeOnly ? " · Showing active team members only" : " · Including former / inactive records"}
        </p>
      </div>

      <div className="no-print mb-4 flex flex-wrap items-end gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600"
          />
          Active staff only
        </label>
      </div>

      {error ? (
        <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No staff records match your filters.</p>
      ) : (
        <>
          <div className="mb-3 print:hidden">
            <Label>How to read the table</Label>
            <ul className="mt-1 list-inside list-disc text-xs text-gray-600 dark:text-gray-400">
              <li>
                <strong>Days</strong> — full day names; a range like &quot;Monday through Friday&quot; means every weekday in
                that span.
              </li>
              <li>
                <strong>Usual hours</strong> — the times recorded for that person (e.g. start and end of shift).
              </li>
            </ul>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 print:border-gray-400">
            <Table>
              <TableHeader className="bg-gray-50 dark:bg-gray-900/50 print:bg-gray-100">
                <TableRow>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Team member
                  </TableCell>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Role
                  </TableCell>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Days in the office
                  </TableCell>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Usual hours
                  </TableCell>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                    Phone
                  </TableCell>
                  <TableCell isHeader className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 print:hidden">
                    Status
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const daysPlain = formatWorkingDaysPlainEnglish(r.workingDays);
                  return (
                    <TableRow
                      key={r.id}
                      className={`print:break-inside-avoid ${!r.isActive ? "bg-gray-50 dark:bg-white/5" : ""}`}
                    >
                      <TableCell className="align-top text-sm font-medium text-gray-900 dark:text-white print:text-black">
                        {r.name}
                      </TableCell>
                      <TableCell className="align-top text-sm text-gray-700 dark:text-gray-300 print:text-gray-900">
                        {r.title}
                      </TableCell>
                      <TableCell className="align-top text-sm text-gray-800 dark:text-gray-200 print:text-black">
                        {daysPlain}
                      </TableCell>
                      <TableCell className="align-top text-sm tabular-nums text-gray-800 dark:text-gray-200 print:text-black">
                        {r.workingHours?.trim() || "—"}
                      </TableCell>
                      <TableCell className="align-top text-sm tabular-nums text-gray-700 dark:text-gray-300 print:text-gray-900">
                        {r.phone?.trim() || "—"}
                      </TableCell>
                      <TableCell className="print:hidden align-top text-xs capitalize text-gray-500 dark:text-gray-400">
                        {r.isActive ? "Active" : "Inactive"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <p className="mt-4 text-center text-[11px] text-gray-400 dark:text-gray-500 print:mt-6 print:text-gray-600">
            Call a Doctor — team work schedule. Schedules may change; confirm with the clinic for holidays and exceptions.
          </p>
        </>
      )}

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .work-schedule-report-wrap {
            max-width: 100%;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
