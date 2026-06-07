"use client";

import React from "react";
import Link from "next/link";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import StaffMemberForm from "@/components/hr/StaffMemberForm";
import { useAuth } from "@/context/AuthContext";

export default function HrStaffNewPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("hr.create");

  if (!hasPermission("hr.view")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Register staff" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission.</p>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div>
        <div className="mb-6">
          <Link href="/hr/staff" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
            ← Staff list
          </Link>
        </div>
        <PageBreadCrumb pageTitle="Register staff" />
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to register staff.</p>
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
      <PageBreadCrumb pageTitle="Register staff" />
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Add a staff record (not a system login). Upload a CV as PDF if available.
      </p>
      <StaffMemberForm mode="create" />
    </div>
  );
}
