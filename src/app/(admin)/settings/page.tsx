"use client";

import React from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";

type Card = { title: string; description: string; href: string; anyOf: string[] };

const cards: Card[] = [
  {
    title: "Branches & access",
    description: "Create branches and assign which users can work at each location.",
    href: "/settings/branches",
    anyOf: ["settings.manage"],
  },
  {
    title: "Doctors",
    description: "Manage doctors, specialties, branch assignment, and linked staff accounts.",
    href: "/settings/doctors",
    anyOf: ["appointments.view"],
  },
  {
    title: "Services",
    description: "Appointment services, pricing, duration, and branch scope.",
    href: "/settings/services",
    anyOf: ["appointments.view"],
  },
  {
    title: "Activity log",
    description: "Sign-ins and user actions across the system (audit trail).",
    href: "/settings/activity",
    anyOf: ["audit.view"],
  },
];

export default function SettingsHubPage() {
  const { hasPermission } = useAuth();
  const visible = cards.filter((c) => c.anyOf.some((p) => hasPermission(p)));
  const canSettingsHub =
    hasPermission("settings.view") ||
    hasPermission("appointments.view") ||
    hasPermission("audit.view");

  if (!canSettingsHub) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Settings" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have access to the settings area.</p>
        </div>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Settings" />
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm text-gray-500 dark:text-gray-400">You do not have access to any settings sections.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Settings" />
      <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
        Branches, clinic setup (doctors, services), user access, and system configuration. Financial ledger and accounts are under{" "}
        <Link href="/accounting" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          Accounting
        </Link>
        .
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
