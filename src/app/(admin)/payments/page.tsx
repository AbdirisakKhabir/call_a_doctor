"use client";

import React from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { DollarLineIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import ClientsWithBalanceTable from "@/components/finance/ClientsWithBalanceTable";

export default function PaymentsPage() {
  const { hasPermission } = useAuth();
  const canRecordPayment =
    hasPermission("accounts.deposit") || hasPermission("pharmacy.pos");

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

      <ClientsWithBalanceTable />
    </>
  );
}
