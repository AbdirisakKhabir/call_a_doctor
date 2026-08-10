"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import { DollarLineIcon } from "@/icons";
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
import PatientPaymentForm, { type PatientPaymentTarget } from "@/components/patients/PatientPaymentForm";

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

export default function PaymentsPage() {
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
  const [paymentPatient, setPaymentPatient] = useState<PatientPaymentTarget | null>(null);
  const pageSize = 20;

  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");

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
    loadPatients();
  }, [loadPatients]);

  const hasActiveFilters = searchDebounced.length >= 1 || branchId !== "";
  const showBranchFilter = seesAllBranches || branches.length > 1;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Payments" />
        <div className="flex flex-wrap items-center gap-3">
          {canRecordPayment && (
            <Link
              href="/payments/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition hover:bg-brand-600 hover:shadow-lg hover:shadow-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:shadow-brand-500/20 dark:focus-visible:ring-offset-gray-900"
            >
              <DollarLineIcon className="h-5 w-5 opacity-95" />
              Record payment
            </Link>
          )}
          <Link
            href="/finance/payments"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-white/5"
          >
            Payment list
          </Link>
          <Link
            href="/patients"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-white/5"
          >
            Manage clients
          </Link>
        </div>
      </div>

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

      {paymentPatient ? (
        <div className="mb-6 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Record payment</h3>
            <button
              type="button"
              onClick={() => setPaymentPatient(null)}
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Close
            </button>
          </div>
          <PatientPaymentForm
            key={paymentPatient.id}
            patient={paymentPatient}
            onCancel={() => setPaymentPatient(null)}
            cancelLabel="Close"
            onSuccess={async () => {
              await loadPatients();
              const res = await authFetch(`/api/patients/${paymentPatient.id}`);
              if (res.ok) {
                const p = (await res.json()) as {
                  id: number;
                  name: string;
                  patientCode: string;
                  accountBalance?: number;
                };
                const balance = typeof p.accountBalance === "number" ? p.accountBalance : 0;
                if (balance <= 0.009) {
                  setPaymentPatient(null);
                } else {
                  setPaymentPatient({
                    id: p.id,
                    name: p.name,
                    patientCode: p.patientCode,
                    accountBalance: balance,
                  });
                }
              } else {
                setPaymentPatient(null);
              }
            }}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Clients with balance</h3>
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
                <TableCell isHeader className="text-right">Balance due</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
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
                    {canRecordPayment ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentPatient({
                            id: p.id,
                            name: p.name,
                            patientCode: p.patientCode,
                            accountBalance: p.accountBalance ?? 0,
                          })
                        }
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
                      >
                        Make payment
                      </button>
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
