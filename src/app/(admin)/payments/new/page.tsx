"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import PatientPaymentForm, { type PatientPaymentTarget } from "@/components/patients/PatientPaymentForm";
import ClientsWithBalanceTable from "@/components/finance/ClientsWithBalanceTable";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function NewPaymentPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  const canRecordPayment = hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");

  const [selected, setSelected] = useState<PatientPaymentTarget | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [loadError, setLoadError] = useState("");

  const pickPatient = useCallback(async (id: number) => {
    setLoadError("");
    setLoadingPatient(true);
    try {
      const res = await authFetch(`/api/patients/${id}`);
      if (!res.ok) {
        setLoadError("Could not load this client. Try again.");
        setSelected(null);
        return;
      }
      const p = (await res.json()) as {
        id: number;
        name: string;
        patientCode: string;
        accountBalance?: number;
      };
      setSelected({
        id: p.id,
        name: p.name,
        patientCode: p.patientCode,
        accountBalance: typeof p.accountBalance === "number" ? p.accountBalance : 0,
      });
    } finally {
      setLoadingPatient(false);
    }
  }, []);

  useEffect(() => {
    if (!patientIdParam) {
      setSelected(null);
      return;
    }
    const id = Number(patientIdParam);
    if (!Number.isInteger(id) || id <= 0) return;
    void pickPatient(id);
  }, [patientIdParam, pickPatient]);

  if (!canRecordPayment) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Record payment" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">You do not have permission to record payments.</p>
        <Link href="/payments" className="mt-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Back to payments
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageBreadCrumb pageTitle="Record payment" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/payments" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Client balances
          </Link>
          <Link href="/finance/payments" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Payment list
          </Link>
        </div>
      </div>

      {!patientIdParam ? (
        <>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Choose a client with a balance, then Make payment to enter lab, calendar, prescription, and credit
            amounts separately.
          </p>
          <ClientsWithBalanceTable />
        </>
      ) : loadingPatient && !selected ? (
        <p className="text-sm text-gray-500">Loading client…</p>
      ) : loadError ? (
        <p className="text-sm text-error-600 dark:text-error-400">{loadError}</p>
      ) : selected ? (
        <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Payment form</h3>
            <Link href="/payments/new" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              Back to clients
            </Link>
          </div>
          <PatientPaymentForm
            key={selected.id}
            patient={selected}
            onCancel={() => router.push("/payments/new")}
            cancelLabel="Back to clients"
            onSuccess={async () => {
              const res = await authFetch(`/api/patients/${selected.id}`);
              if (res.ok) {
                const p = (await res.json()) as {
                  id: number;
                  name: string;
                  patientCode: string;
                  accountBalance?: number;
                };
                const balance = typeof p.accountBalance === "number" ? p.accountBalance : 0;
                if (balance <= 0.009) {
                  router.push("/payments/new");
                  return;
                }
                setSelected({
                  id: p.id,
                  name: p.name,
                  patientCode: p.patientCode,
                  accountBalance: balance,
                });
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
