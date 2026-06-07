"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import StaffMemberForm, { type StaffMemberFormInitial } from "@/components/hr/StaffMemberForm";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { normalizeWorkingDays, type WorkdayCode } from "@/lib/hr-staff";

export default function HrStaffEditPage() {
  const params = useParams();
  const id = Number(params.id);
  const { hasPermission } = useAuth();
  const canView = hasPermission("hr.view");
  const canEdit = hasPermission("hr.edit");

  const [initial, setInitial] = useState<StaffMemberFormInitial | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView || !Number.isInteger(id) || id <= 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    void authFetch(`/api/hr/staff/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to load");
        if (cancelled) return;
        let days: WorkdayCode[] = [];
        try {
          const parsed = JSON.parse(data.workingDays as string) as unknown;
          days = normalizeWorkingDays(parsed) as WorkdayCode[];
        } catch {
          days = [];
        }
        const hire = new Date(data.hireDate as string);
        setInitial({
          name: String(data.name ?? ""),
          phone: String(data.phone ?? ""),
          address: String(data.address ?? ""),
          title: String(data.title ?? ""),
          hireDate: Number.isNaN(hire.getTime()) ? new Date().toISOString().slice(0, 10) : hire.toISOString().slice(0, 10),
          workingDays: days,
          workingHours: String(data.workingHours ?? ""),
          salaryAmount:
            data.salaryAmount != null && data.salaryAmount !== "" ? String(data.salaryAmount) : "",
          cvUrl: data.cvUrl ? String(data.cvUrl) : null,
          cvPublicId: data.cvPublicId ? String(data.cvPublicId) : null,
          photoUrl: data.photoUrl ? String(data.photoUrl) : null,
          photoPublicId: data.photoPublicId ? String(data.photoPublicId) : null,
          isActive: data.isActive !== false,
        });
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
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
        <PageBreadCrumb pageTitle="Edit staff" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Staff list
          </Link>
        </div>
        <PageBreadCrumb pageTitle="Edit staff" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to edit staff.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          ← Staff list
        </Link>
      </div>
      <PageBreadCrumb pageTitle="Edit staff" />
      {loading ? (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : loadError ? (
        <p className="mt-6 text-sm text-error-600 dark:text-error-400">{loadError}</p>
      ) : initial ? (
        <div className="mt-6">
          <StaffMemberForm mode="edit" staffId={id} initial={initial} />
        </div>
      ) : null}
    </div>
  );
}
