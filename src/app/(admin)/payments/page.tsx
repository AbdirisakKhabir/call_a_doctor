"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
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
import PatientPaymentModal from "@/components/patients/PatientPaymentModal";
import ListPaginationFooter from "@/components/tables/ListPaginationFooter";

type Patient = {
  id: number;
  patientCode: string;
  name: string;
  phone: string | null;
  accountBalance?: number;
};

export default function PaymentsPage() {
  const { hasPermission } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [paymentPatient, setPaymentPatient] = useState<Patient | null>(null);

  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");

  async function loadPatients() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    const res = await authFetch(`/api/patients?${params}`);
    if (res.ok) {
      const body = await res.json();
      setPatients(body.data ?? []);
      setTotal(typeof body.total === "number" ? body.total : 0);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    loadPatients().finally(() => setLoading(false));
  }, [search, page]);

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
            href="/patients"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-white/5"
          >
            Manage clients
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Clients with balance</h3>
          <input
            type="text"
            placeholder="Search by name, code, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full max-w-md rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-brand-300 dark:border-gray-700 dark:text-white sm:w-64"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400" />
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-gray-500 dark:text-gray-400">No clients match your search.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-transparent! hover:bg-transparent!">
                <TableCell isHeader>Code</TableCell>
                <TableCell isHeader>Name</TableCell>
                <TableCell isHeader>Phone</TableCell>
                <TableCell isHeader className="text-right">Balance due</TableCell>
                <TableCell isHeader className="text-right">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.patientCode}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${(p.accountBalance ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {canRecordPayment && (p.accountBalance ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => setPaymentPatient(p)}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900"
                      >
                        Record payment
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

      {paymentPatient && (
        <PatientPaymentModal
          patient={paymentPatient}
          onClose={() => setPaymentPatient(null)}
          onSuccess={loadPatients}
        />
      )}
    </>
  );
}
