"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { useBranchScope } from "@/hooks/useBranchScope";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Branch = { id: number; name: string };

type Patient = {
  id: number;
  patientCode: string;
  name: string;
  phone: string | null;
  mobile: string | null;
  accountBalance?: number;
  registeredBranch?: { id: number; name: string } | null;
};

type Props = {
  actionHref?: (patient: Patient) => string;
  actionLabel?: string;
  canAct?: boolean;
  heading?: string;
};

export default function ClientsWithBalanceTable({
  actionHref = (p) => `/payments/new?patientId=${p.id}`,
  actionLabel = "Make payment",
  canAct,
  heading = "Clients with balance",
}: Props) {
  const { hasPermission } = useAuth();
  const { seesAllBranches, singleAssignedBranchId, allBranchesLabel } = useBranchScope();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState<number | null>(null);
  const pageSize = 20;

  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");
  const showAction = canAct ?? canRecordPayment;

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    authFetch("/api/branches")
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        const list = Array.isArray(j) ? j : (j.data ?? []);
        if (Array.isArray(list)) setBranches(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (singleAssignedBranchId && !branchId) {
      setBranchId(String(singleAssignedBranchId));
    }
  }, [singleAssignedBranchId, branchId]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced, branchId]);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      balanceOnly: "1",
      page: String(page),
      pageSize: String(pageSize),
    });
    if (searchDebounced) params.set("search", searchDebounced);
    if (branchId) params.set("branchId", branchId);

    const res = await authFetch(`/api/patients?${params}`);
    if (res.ok) {
      const body = await res.json();
      setPatients(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
      setTotalOutstanding(typeof body.totalOutstanding === "number" ? body.totalOutstanding : null);
    } else {
      setPatients([]);
      setTotal(0);
      setTotalOutstanding(null);
    }
    setLoading(false);
  }, [page, searchDebounced, branchId]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const hasActiveFilters = searchDebounced.length >= 1 || branchId !== "";
  const showBranchFilter = seesAllBranches || branches.length > 1;

  return (
    <>
      <div className="mb-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showBranchFilter ? (
            <div>
              <Label>Branch</Label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-700 dark:text-white"
              >
                <option value="">{allBranchesLabel}</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className={showBranchFilter ? "" : "sm:col-span-2 lg:col-span-2"}>
            <Label>Search</Label>
            <input
              type="text"
              placeholder="Name, code, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white"
            />
          </div>
        </div>
        {totalOutstanding != null && !loading ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-white">{total}</span> client
            {total === 1 ? "" : "s"} with balance
            {hasActiveFilters ? " matching filters" : ""}
            {" · "}
            <span className="font-mono font-medium tabular-nums text-gray-900 dark:text-white">
              ${totalOutstanding.toFixed(2)}
            </span>{" "}
            total outstanding
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{heading}</h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {hasActiveFilters ? "No clients with balance match your filters." : "No clients with an outstanding balance."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Phone</TableCell>
                {showBranchFilter ? <TableCell isHeader>Branch</TableCell> : null}
                <TableCell isHeader className="text-right">
                  Balance due
                </TableCell>
                <TableCell isHeader className="text-right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.patientCode}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.phone || p.mobile || "—"}</TableCell>
                  {showBranchFilter ? (
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {p.registeredBranch?.name ?? "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                    ${(p.accountBalance ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {showAction ? (
                      <Link
                        href={actionHref(p)}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
                      >
                        {actionLabel}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPaginationFooter
          loading={loading}
          total={total}
          page={page}
          pageSize={pageSize}
          noun="clients"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
