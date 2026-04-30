"use client";

import React from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";

type Card = { title: string; description: string; href: string; anyOf: string[] };

const cards: Card[] = [
  {
    title: "Appointment sales report",
    description: "Spreadsheet-style summary of visit billing by period and branch.",
    href: "/reports/appointment-sales",
    anyOf: ["accounts.view", "accounts.reports", "pharmacy.view", "pharmacy.pos", "appointments.view"],
  },
  {
    title: "Accounts",
    description: "Cash, bank, and other accounts with opening balances.",
    href: "/settings/accounts",
    anyOf: ["accounts.view", "accounts.manage"],
  },
  {
    title: "Payment methods",
    description: "Named methods that route deposits into the correct account.",
    href: "/settings/payment-methods",
    anyOf: ["accounts.view", "accounts.manage"],
  },
  {
    title: "Deposits & withdrawals",
    description: "Deposit pharmacy sales into an account or record withdrawals.",
    href: "/settings/account-transactions",
    anyOf: ["accounts.view", "accounts.deposit", "accounts.withdraw"],
  },
  {
    title: "Account statement",
    description: "Transaction statement with running balances and date filters.",
    href: "/settings/account-statement",
    anyOf: ["accounts.reports"],
  },
];

export default function AccountingHubPage() {
  const { hasPermission } = useAuth();
  const visible = cards.filter((c) => c.anyOf.some((p) => hasPermission(p)));

  if (visible.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Accounting" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You do not have access to accounting. Ask an administrator to assign accounts permissions to your role.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Accounting" />
      <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Ledger accounts, payment methods, deposits, withdrawals, and statements. Visit billing sales are listed under
        Finance. Access is controlled by accounts permissions on your role.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {visible.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/3"
          >
            <h2 className="text-lg font-semibold text-gray-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
              {c.title}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{c.description}</p>
            <span className="mt-4 inline-flex text-sm font-medium text-brand-600 dark:text-brand-400">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
