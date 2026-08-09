"use client";

import React from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { AnalyticsTable } from "@/lib/analytics/types";
import { formatAnalyticsValue } from "./format";

function renderCell(value: string | number | null | undefined, format?: AnalyticsTable["columns"][number]["format"]) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return formatAnalyticsValue(value, format ?? "number");
  return value;
}

export default function AnalyticsTableCard({ table }: { table: AnalyticsTable }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{table.title}</h3>
        {table.subtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{table.subtitle}</p>
        ) : null}
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {table.columns.map((column) => (
                <TableCell key={column.key} isHeader className={column.align === "right" ? "text-right" : undefined}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.columns.length} className="text-gray-500 dark:text-gray-400">
                  No rows for this period.
                </TableCell>
              </TableRow>
            ) : (
              table.rows.map((row, index) => (
                <TableRow key={`${table.key}-${index}`}>
                  {table.columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={column.align === "right" ? "text-right tabular-nums" : undefined}
                    >
                      {renderCell(row[column.key], column.format)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
            {table.totals && table.rows.length > 0 ? (
              <TableRow>
                {table.columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={`font-semibold text-gray-900 dark:text-white ${
                      column.align === "right" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {renderCell(table.totals?.[column.key], column.format)}
                  </TableCell>
                ))}
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
