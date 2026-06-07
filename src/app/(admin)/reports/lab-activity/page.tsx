"use client";

import React, { useCallback, useEffect, useState } from "react";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import DateField from "@/components/form/DateField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBranchScope } from "@/hooks/useBranchScope";

type Branch = { id: number; name: string };

type Payload = {
  branch: { id: number; name: string };
  from: string;
  to: string;
  testsCompleted: number;
  disposableSummary: { code: string; name: string; unit: string; totalOut: number }[];
  inventorySnapshot: {
    id: number;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    sellingPrice: number;
  }[];
  movementLog: {
    at: string;
    reason: string;
    code: string;
    name: string;
    unit: string;
    signedQuantity: number;
    notes: string | null;
  }[];
};

export default function LabActivityReportPage() {
  const { hasPermission } = useAuth();
  const { singleAssignedBranchId } = useBranchScope();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
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
    else if (!branchId && branches.length > 0) setBranchId(String(branches[0].id));
  }, [singleAssignedBranchId, branches, branchId]);

  const run = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        branchId,
        from,
        to,
      });
      const res = await authFetch(`/api/reports/lab-activity?${params.toString()}`);
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
  }, [branchId, from, to]);

  useEffect(() => {
    if (branchId) void run();
  }, [branchId, from, to, run]);

  if (!hasPermission("lab.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Lab activity report" />
        <p className="mt-4 text-sm text-gray-500">You do not have permission.</p>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Lab activity report" />
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        Tests completed in the period, consumables used from lab inventory, current stock snapshot, and detailed movements (receipts, test disposables, lab POS).
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <div>
          <Label>Branch</Label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 h-11 min-w-[200px] rounded-lg border border-gray-200 px-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>From</Label>
          <DateField value={from} onChange={setFrom} className="mt-1" />
        </div>
        <div>
          <Label>To</Label>
          <DateField value={to} onChange={setTo} className="mt-1" />
        </div>
        <Button onClick={() => void run()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-error-50 px-4 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Summary</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Branch <strong>{data.branch.name}</strong> · {data.from} → {data.to}
            </p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-brand-600 dark:text-brand-400">
              {data.testsCompleted}{" "}
              <span className="text-base font-normal text-gray-600 dark:text-gray-400">tests completed</span>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Disposables consumed (period)</h2>
            {data.disposableSummary.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No disposable deductions in this range.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell isHeader>Code</TableCell>
                      <TableCell isHeader>Item</TableCell>
                      <TableCell isHeader className="text-right">Qty out</TableCell>
                      <TableCell isHeader>Unit</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.disposableSummary.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalOut}</TableCell>
                        <TableCell>{r.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Lab inventory now (snapshot)</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader>Name</TableCell>
                    <TableCell isHeader className="text-right">On hand</TableCell>
                    <TableCell isHeader>Unit</TableCell>
                    <TableCell isHeader className="text-right">Lab POS $</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.inventorySnapshot.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell>{r.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.sellingPrice.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movements in period</h2>
            <p className="mt-1 text-xs text-gray-500">
              Reasons: <code>receive</code> (stock in from pharmacy POS Lab customer, adjustments, opening),{" "}
              <code>disposable</code> (test result line completed), <code>lab_sale</code> (legacy rows only).
            </p>
            <div className="mt-3 max-h-[480px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell isHeader>When</TableCell>
                    <TableCell isHeader>Reason</TableCell>
                    <TableCell isHeader>Code</TableCell>
                    <TableCell isHeader className="text-right">Δ qty</TableCell>
                    <TableCell isHeader>Notes</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movementLog.map((m, i) => (
                    <TableRow key={`${m.at}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs text-gray-600">
                        {new Date(m.at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{m.reason}</TableCell>
                      <TableCell className="font-mono text-xs">{m.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.signedQuantity}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-gray-500">
                        <span title={m.notes ?? ""}>{m.notes ?? "—"}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
