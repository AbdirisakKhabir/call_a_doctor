"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatWorkingDaysLabel } from "@/lib/hr-staff";
import { PencilIcon } from "@/icons";

type StaffDetail = {
  id: number;
  name: string;
  phone: string;
  address: string;
  title: string;
  hireDate: string;
  workingDays: string;
  workingHours: string;
  salaryAmount: number | null;
  cvUrl: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; name: string | null; email: string } | null;
};

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{children}</dd>
    </div>
  );
}

export default function HrStaffProfilePage() {
  const params = useParams();
  const id = Number(params.id);
  const { hasPermission } = useAuth();
  const canView = hasPermission("hr.view");
  const canEdit = hasPermission("hr.edit");

  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !Number.isInteger(id) || id <= 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void authFetch(`/api/hr/staff/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load");
        if (!cancelled) setStaff(data as StaffDetail);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, id]);

  if (!canView) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Staff profile" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Staff list
          </Link>
        </div>
        <PageBreadCrumb pageTitle="Staff profile" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Staff list
          </Link>
        </div>
        <PageBreadCrumb pageTitle="Staff profile" />
        <p className="mt-6 text-sm text-error-600 dark:text-error-400">{error || "Not found."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Staff list
          </Link>
          <div className="mt-3">
            <PageBreadCrumb pageTitle="Staff profile" />
          </div>
        </div>
        {canEdit ? (
          <Link href={`/hr/staff/${staff.id}/edit`}>
            <Button size="sm">
              <PencilIcon className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/3">
        <div className="border-b border-gray-200 bg-brand-50/80 px-6 py-5 dark:border-gray-800 dark:bg-brand-950/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {staff.photoUrl ? (
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-md dark:ring-gray-800">
                  <Image
                    src={staff.photoUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
              ) : (
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gray-200 text-2xl font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  aria-hidden
                >
                  {staff.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{staff.name}</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{staff.title}</p>
              </div>
            </div>
            <div>
              {staff.isActive ? (
                <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-500/20 dark:text-green-300">
                  Active
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-8 px-6 py-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Contact</h2>
            <dl>
              <ProfileField label="Phone">{staff.phone}</ProfileField>
              <ProfileField label="Address">
                <span className="whitespace-pre-wrap">{staff.address}</span>
              </ProfileField>
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Employment</h2>
            <dl>
              <ProfileField label="Hire date">{new Date(staff.hireDate).toLocaleDateString()}</ProfileField>
              <ProfileField label="Working days">{formatWorkingDaysLabel(staff.workingDays)}</ProfileField>
              <ProfileField label="Working hours">{staff.workingHours}</ProfileField>
              <ProfileField label="Salary">
                {staff.salaryAmount != null ? `$${staff.salaryAmount.toFixed(2)}` : "—"}
              </ProfileField>
            </dl>
          </section>

          <section className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Documents</h2>
            <dl>
              <ProfileField label="CV">
                {staff.cvUrl ? (
                  <a
                    href={staff.cvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Open CV (PDF)
                  </a>
                ) : (
                  "—"
                )}
              </ProfileField>
            </dl>
          </section>

          <section className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Record</h2>
            <dl className="grid gap-0 sm:grid-cols-2">
              <ProfileField label="Registered by">
                {staff.createdBy?.name || staff.createdBy?.email || "—"}
              </ProfileField>
              <ProfileField label="Created">{new Date(staff.createdAt).toLocaleString()}</ProfileField>
              <ProfileField label="Last updated">{new Date(staff.updatedAt).toLocaleString()}</ProfileField>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
