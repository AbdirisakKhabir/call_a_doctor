"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

type Branch = { id: number; name: string };

type Row = {
  id: number;
  patientCode: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  accountBalance: number;
  city?: { id: number; name: string } | null;
  village?: { id: number; name: string } | null;
  registeredBranch?: { id: number; name: string } | null;
};

type Payload = {
  patients: Row[];
  count: number;
  totalOutstanding: number;
};

export default function OutstandingBalancesReportPage() {
  const { hasPermission } = useAuth();
  const { seesAllBranches, singleAssignedBranchId, assignedBranchIds } = useBranchScope();
  const canView =
    hasPermission("accounts.deposit") ||
    hasPermission("pharmacy.pos") ||
    hasPermission("patients.view");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.data ?? [];
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (singleAssignedBranchId && !branchId) setBranchId(String(singleAssignedBranchId));
    else if (seesAllBranches && !branchId) setBranchId("");
  }, [singleAssignedBranchId, seesAllBranches, branchId]);

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      const q = params.toString();
      const res = await authFetch(`/api/reports/outstanding-balances${q ? `?${q}` : ""}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "Failed");
        setData(null);
        return;
      }
      setData(j as Payload);
    } catch {
      setError("Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (canView) void run();
  }, [canView, run]);

  const exportXlsx = () => {
    if (!data?.patients.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      data.patients.map((p) => ({
        Code: p.patientCode,
        Name: p.name,
        Phone: p.phone ?? "",
        Email: p.email ?? "",
        City: p.city?.name ?? "",
        Village: p.village?.name ?? "",
        "Registered branch": p.registeredBranch?.name ?? "",
        "Balance due": Number(p.accountBalance.toFixed(2)),
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Outstanding");
    XLSX.writeFile(wb, `outstanding-balances-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Outstanding balances" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  const showBranchFilter =
    seesAllBranches || (Array.isArray(assignedBranchIds) && assignedBranchIds.length > 1);
  const branchOptions =
    seesAllBranches || !assignedBranchIds?.length
      ? branches
      : branches.filter((b) => assignedBranchIds.includes(b.id));

  return (
    <div>
      <PageBreadCrumb pageTitle="Outstanding balances" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Active clients with money owed on their account (balance due). Amounts are sorted from highest balance first.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        {showBranchFilter && (
          <div>
            <Label>Branch</Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 px-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="">All allowed branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={() => void run()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
        <Button variant="outline" onClick={exportXlsx} disabled={loading || !data?.patients.length}>
          Export Excel
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <p>
              <span className="text-gray-600 dark:text-gray-400">Clients with a balance: </span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{data.count}</span>
            </p>
            <p>
              <span className="text-gray-600 dark:text-gray-400">Total outstanding: </span>
              <span className="text-lg font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                ${data.totalOutstanding.toFixed(2)}
              </span>
            </p>
          </div>

          {data.patients.length === 0 ? (
            <p className="text-sm text-gray-500">No outstanding balances match this filter.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader>Client</TableCell>
                    <TableCell isHeader>Phone</TableCell>
                    <TableCell isHeader>Location</TableCell>
                    <TableCell isHeader>Registered branch</TableCell>
                    <TableCell isHeader className="text-right">
                      Balance due
                    </TableCell>
                    <TableCell isHeader>
                      <span className="sr-only">Actions</span>
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.patients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.patientCode}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>{p.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                        {[p.city?.name, p.village?.name].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>{p.registeredBranch?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        ${p.accountBalance.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/patients/${p.id}/history`}
                          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Open
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
