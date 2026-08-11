"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import RolePermissionsForm, { type RoleFormValues } from "@/components/roles/RolePermissionsForm";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function NewRolePage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  if (!hasPermission("roles.create")) {
    return (
      <div>
        <PageBreadCrumb pageTitle="Add role" />
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-16 dark:border-gray-800 dark:bg-white/3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            You do not have permission to create roles.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(values: RoleFormValues) {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await authFetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description || undefined,
          permissionIds: values.permissionIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to create role");
        return;
      }
      router.push("/roles");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageBreadCrumb pageTitle="Add role" />
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Create a role and choose which pages users with this role can access in the sidebar.
      </p>
      <div className="mt-6">
        <RolePermissionsForm
          initialValues={{ name: "", description: "", permissionIds: [] }}
          submitLabel="Create role"
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
