"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Label from "@/components/form/Label";
import PatientPaymentModal, { type PatientPaymentTarget } from "@/components/patients/PatientPaymentModal";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type SearchHit = {
  id: number;
  patientCode: string;
  name: string;
  phone: string | null;
  accountBalance?: number;
};

export default function NewPaymentPage() {
  const { hasPermission } = useAuth();
  const canRecordPayment = hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientPaymentTarget | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      authFetch(`/api/patients?search=${encodeURIComponent(t)}&page=1&pageSize=20`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { data?: SearchHit[] } | null) => {
          if (cancelled) return;
          setResults(Array.isArray(body?.data) ? body.data : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  async function pickPatient(id: number) {
    setLoadError("");
    setLoadingPatient(true);
    try {
      const res = await authFetch(`/api/patients/${id}`);
      if (!res.ok) {
        setLoadError("Could not load this client. Try again.");
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
  }

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
        <Link href="/payments" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Back to client balances
        </Link>
      </div>

      {!selected ? (
        <div className="max-w-xl rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3">
          <Label>Find client</Label>
          <input
            type="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type at least 2 characters…"
            className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-4 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {q.trim().length > 0 && q.trim().length < 2 && (
            <p className="mt-2 text-xs text-gray-500">Enter at least 2 characters to search.</p>
          )}
          {searching && <p className="mt-2 text-xs text-gray-500">Searching…</p>}
          {loadError && <p className="mt-2 text-sm text-error-600 dark:text-error-400">{loadError}</p>}
          {loadingPatient && <p className="mt-2 text-sm text-gray-500">Loading client…</p>}

          <ul className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800">
            {q.trim().length >= 2 && !searching && results.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No clients match.</li>
            )}
            {results.map((p) => (
              <li key={p.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <button
                  type="button"
                  disabled={loadingPatient}
                  onClick={() => void pickPatient(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800/50"
                >
                  <span>
                    <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500">{p.patientCode}</span>
                    {p.phone ? <span className="mt-0.5 block text-xs text-gray-500">{p.phone}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-gray-700 dark:text-gray-300">
                    ${(p.accountBalance ?? 0).toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <PatientPaymentModal
          key={selected.id}
          embedded
          patient={selected}
          onClose={() => setSelected(null)}
          onSuccess={async () => {
            const res = await authFetch(`/api/patients/${selected.id}`);
            if (res.ok) {
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
            }
          }}
        />
      )}
    </div>
  );
}
